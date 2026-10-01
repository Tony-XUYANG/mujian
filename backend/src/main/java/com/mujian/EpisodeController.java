package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class EpisodeController {
    private final JdbcTemplate db;
    private final DramaRepository dramas;
    private final ReleaseService releases;
    public EpisodeController(JdbcTemplate db, DramaRepository dramas, ReleaseService releases) { this.db=db; this.dramas=dramas; this.releases=releases; }

    public record EpisodeInput(@Min(value=1,message="集号需为1–500") @Max(value=500,message="集号需为1–500") int episodeNo,
        @NotBlank(message="请输入分集标题") @Size(max=80,message="分集标题最多80字") String title,
        @NotBlank(message="请输入分集视频地址") @Size(max=1000,message="视频地址过长") String videoUrl) {}
    public record SeriesInput(@Pattern(regexp="SERIALIZING|COMPLETED",message="请选择连载或完结状态") @NotNull(message="请选择状态") String status,
        @Min(value=1,message="总集数需为1–500") @Max(value=500,message="总集数需为1–500") int totalEpisodes) {}
    public record Progress(@Min(value=0,message="进度不能小于0") @Max(value=86400,message="进度超出范围") int progressSec,
        @Min(value=1,message="视频时长必须大于0") @Max(value=86400,message="视频时长超出范围") int durationSec) {}

    @GetMapping("/dramas/{id}/episodes")
    public List<Map<String,Object>> episodes(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        dramas.require(id);
        return db.queryForList("""
            SELECT e.id,e.episode_no AS episodeNo,e.title,e.video_url AS videoUrl,
                   COALESCE(p.progress_sec,0) AS progressSec,COALESCE(p.duration_sec,0) AS durationSec,
                   p.last_watched AS lastWatched
            FROM drama_episode e LEFT JOIN episode_progress p ON p.episode_id=e.id AND p.user_id=?
            WHERE e.drama_id=? ORDER BY e.episode_no
            """,DramaController.userId(jwt),id);
    }

    @PutMapping("/dramas/{id}/episodes/{episodeId}/progress") @Transactional
    public Map<String,Object> progress(@PathVariable long id,@PathVariable long episodeId,@Valid @RequestBody Progress in,@AuthenticationPrincipal Jwt jwt) {
        // Serialize saves per drama with delete/edit operations, and validate ownership before writing.
        lock(id); requireEpisode(id,episodeId);
        long userId=DramaController.userId(jwt);
        int progress=Math.min(in.progressSec(),in.durationSec());
        db.update("""
            INSERT INTO episode_progress(user_id,episode_id,progress_sec,duration_sec) VALUES (?,?,?,?)
            ON DUPLICATE KEY UPDATE progress_sec=VALUES(progress_sec),duration_sec=VALUES(duration_sec),last_watched=CURRENT_TIMESTAMP(6)
            """,userId,episodeId,progress,in.durationSec());
        db.update("""
            INSERT INTO watch_history(user_id,drama_id,progress_sec,duration_sec) VALUES (?,?,?,?)
            ON DUPLICATE KEY UPDATE progress_sec=VALUES(progress_sec),duration_sec=VALUES(duration_sec),last_watched=CURRENT_TIMESTAMP
            """,userId,id,progress,in.durationSec());
        return Map.of("saved",true,"progressSec",progress,"durationSec",in.durationSec());
    }

    @PutMapping("/dramas/{id}/follow")
    public Map<String,Object> follow(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        dramas.require(id);
        db.update("INSERT INTO user_follow(user_id,drama_id) VALUES (?,?) ON DUPLICATE KEY UPDATE drama_id=VALUES(drama_id)",DramaController.userId(jwt),id);
        return dramas.detail(id,DramaController.userId(jwt));
    }
    @DeleteMapping("/dramas/{id}/follow")
    public Map<String,Object> unfollow(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        dramas.require(id);
        db.update("DELETE FROM user_follow WHERE user_id=? AND drama_id=?",DramaController.userId(jwt),id);
        return dramas.detail(id,DramaController.userId(jwt));
    }
    @GetMapping("/me/following")
    public List<Map<String,Object>> following(@AuthenticationPrincipal Jwt jwt) {
        long userId=DramaController.userId(jwt);
        var rows=dramas.following(userId);
        var counts=db.queryForList("""
            SELECT e.drama_id AS id,
              SUM(CASE WHEN p.duration_sec>0 AND p.progress_sec>=GREATEST(1,p.duration_sec-2) THEN 0 ELSE 1 END) AS remainingEpisodes,
              SUM(CASE WHEN e.create_time>f.create_time AND p.episode_id IS NULL THEN 1 ELSE 0 END) AS newEpisodes
            FROM user_follow f JOIN drama_episode e ON e.drama_id=f.drama_id
            LEFT JOIN episode_progress p ON p.episode_id=e.id AND p.user_id=f.user_id
            WHERE f.user_id=? GROUP BY e.drama_id
            """,userId);
        for(var row:rows) for(var count:counts) if(row.get("id").equals(count.get("id"))) row.putAll(count);
        return rows;
    }

    @PutMapping("/admin/dramas/{id}/series") @Transactional
    public Map<String,Object> series(@PathVariable long id,@Valid @RequestBody SeriesInput in) {
        lock(id);
        int planned=db.queryForObject("SELECT COALESCE(MAX(episode_no),0) FROM episode_release_plan WHERE drama_id=? AND status='SCHEDULED'",Integer.class,id);
        if(planned>in.totalEpisodes()) bad("总集数不能小于已排期的最大集号");
        if(planned>0 && in.status().equals("COMPLETED")) bad("还有未发布的排期，暂时不能标记完结");
        int max=db.queryForObject("SELECT COALESCE(MAX(episode_no),0) FROM drama_episode WHERE drama_id=?",Integer.class,id);
        int count=db.queryForObject("SELECT COUNT(*) FROM drama_episode WHERE drama_id=?",Integer.class,id);
        if(in.totalEpisodes()<max) bad("总集数不能小于已发布的最大集号");
        if(in.status().equals("COMPLETED") && (count!=in.totalEpisodes() || max!=count)) bad("标记完结前，请发布从第1集到总集数的全部分集");
        db.update("UPDATE drama_series SET status=?,total_episodes=? WHERE drama_id=?",in.status(),in.totalEpisodes(),id);
        return dramas.detail(id,null);
    }
    @PostMapping("/admin/dramas/{id}/episodes") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public List<Map<String,Object>> add(@PathVariable long id,@Valid @RequestBody EpisodeInput in) {
        lock(id); validateEpisode(id,0,in);
        db.update("INSERT INTO drama_episode(drama_id,episode_no,title,video_url) VALUES (?,?,?,?)",id,in.episodeNo(),in.title().trim(),in.videoUrl());
        long episodeId=db.queryForObject("SELECT id FROM drama_episode WHERE drama_id=? AND episode_no=?",Long.class,id,in.episodeNo());
        releases.notifyPublished(id,episodeId,0);
        db.update("UPDATE drama_series SET status='SERIALIZING',total_episodes=GREATEST(total_episodes,?) WHERE drama_id=?",in.episodeNo(),id);
        syncFirst(id); return episodes(id,null);
    }
    @PutMapping("/admin/dramas/{id}/episodes/{episodeId}") @Transactional
    public List<Map<String,Object>> edit(@PathVariable long id,@PathVariable long episodeId,@Valid @RequestBody EpisodeInput in) {
        lock(id); requireEpisode(id,episodeId); validateEpisode(id,episodeId,in);
        int old=db.queryForObject("SELECT episode_no FROM drama_episode WHERE id=?",Integer.class,episodeId);
        db.update("UPDATE drama_episode SET episode_no=?,title=?,video_url=? WHERE id=?",in.episodeNo(),in.title().trim(),in.videoUrl(),episodeId);
        if(old!=in.episodeNo()) db.update("UPDATE drama_series SET status='SERIALIZING',total_episodes=GREATEST(total_episodes,?) WHERE drama_id=?",in.episodeNo(),id);
        syncFirst(id); return episodes(id,null);
    }
    @DeleteMapping("/admin/dramas/{id}/episodes/{episodeId}") @Transactional
    public List<Map<String,Object>> delete(@PathVariable long id,@PathVariable long episodeId) {
        lock(id); requireEpisode(id,episodeId);
        if(db.queryForObject("SELECT COUNT(*) FROM drama_episode WHERE drama_id=?",Integer.class,id)<=1) bad("至少保留一集；若需下架，请删除整部短剧");
        db.update("DELETE FROM drama_episode WHERE id=?",episodeId);
        db.update("""
            DELETE h FROM watch_history h WHERE h.drama_id=? AND NOT EXISTS
              (SELECT 1 FROM episode_progress p JOIN drama_episode e ON e.id=p.episode_id WHERE p.user_id=h.user_id AND e.drama_id=h.drama_id)
            """,id);
        db.update("""
            UPDATE watch_history h SET
              progress_sec=(SELECT p.progress_sec FROM episode_progress p JOIN drama_episode e ON e.id=p.episode_id WHERE p.user_id=h.user_id AND e.drama_id=h.drama_id ORDER BY p.last_watched DESC,e.id DESC LIMIT 1),
              duration_sec=(SELECT p.duration_sec FROM episode_progress p JOIN drama_episode e ON e.id=p.episode_id WHERE p.user_id=h.user_id AND e.drama_id=h.drama_id ORDER BY p.last_watched DESC,e.id DESC LIMIT 1),
              last_watched=(SELECT p.last_watched FROM episode_progress p JOIN drama_episode e ON e.id=p.episode_id WHERE p.user_id=h.user_id AND e.drama_id=h.drama_id ORDER BY p.last_watched DESC,e.id DESC LIMIT 1)
            WHERE h.drama_id=?
            """,id);
        db.update("UPDATE drama_series SET status='SERIALIZING' WHERE drama_id=?",id);
        syncFirst(id); return episodes(id,null);
    }
    private void lock(long id) {
        if(db.queryForList("SELECT id FROM drama WHERE id=? FOR UPDATE",id).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"短剧不存在或已下架");
    }
    private void requireEpisode(long id,long episodeId) {
        if(db.queryForObject("SELECT COUNT(*) FROM drama_episode WHERE id=? AND drama_id=?",Integer.class,episodeId,id)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这集不存在或已下架，请重新打开短剧");
    }
    private void validateEpisode(long id,long episodeId,EpisodeInput in) {
        AdminController.validateUrl(in.videoUrl());
        releases.ensureNotScheduled(id,in.episodeNo(),0);
        if(db.queryForObject("SELECT COUNT(*) FROM drama_episode WHERE drama_id=? AND episode_no=? AND id<>?",Integer.class,id,in.episodeNo(),episodeId)>0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这部短剧已有第"+in.episodeNo()+"集，请使用其他集号");
    }
    private void syncFirst(long id) {
        db.update("UPDATE drama SET video_url=(SELECT video_url FROM drama_episode WHERE drama_id=? ORDER BY episode_no LIMIT 1),update_time=CURRENT_TIMESTAMP WHERE id=?",id,id);
    }
    private void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
}
