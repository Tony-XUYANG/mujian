package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Duration;
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
public class ReleaseController {
    private final JdbcTemplate db;
    private final ReleaseService releases;
    public ReleaseController(JdbcTemplate db,ReleaseService releases) { this.db=db; this.releases=releases; }
    public record PlanInput(@Min(value=1,message="集号需为1–500") @Max(value=500,message="集号需为1–500") int episodeNo,
        @NotBlank(message="请输入分集标题") @Size(max=80,message="分集标题最多80字") String title,
        @NotBlank(message="请输入分集视频地址") @Size(max=1000,message="视频地址过长") String videoUrl,
        @NotNull(message="请选择发布时间") Long publishAt) {}
    public record ReadAll(@NotNull(message="缺少已读范围") @Min(value=0,message="已读范围不正确") Long throughId) {}

    private static final String PLAN_SELECT="""
        SELECT p.id,p.drama_id AS dramaId,d.title AS dramaTitle,d.cover_img AS coverImg,
          p.episode_no AS episodeNo,p.title,p.publish_at AS publishAt,p.status,
          p.episode_id AS episodeId,p.published_at AS publishedAt,
          EXISTS(SELECT 1 FROM user_reservation r WHERE r.plan_id=p.id AND r.user_id=?) AS reserved
        FROM episode_release_plan p JOIN drama d ON d.id=p.drama_id
        """;
    @GetMapping("/release-plans")
    public List<Map<String,Object>> upcoming(@RequestParam(required=false) Long dramaId,@AuthenticationPrincipal Jwt jwt) {
        return db.queryForList(PLAN_SELECT+" WHERE p.status='SCHEDULED' AND (? IS NULL OR p.drama_id=?) ORDER BY p.publish_at,p.id LIMIT 200",DramaController.userId(jwt),dramaId,dramaId);
    }
    @GetMapping("/me/reservations")
    public List<Map<String,Object>> reservations(@AuthenticationPrincipal Jwt jwt) {
        long userId=DramaController.userId(jwt);
        return db.queryForList(PLAN_SELECT+" WHERE EXISTS(SELECT 1 FROM user_reservation r WHERE r.plan_id=p.id AND r.user_id=?) ORDER BY FIELD(p.status,'SCHEDULED','PUBLISHED','CANCELLED'),p.publish_at,p.id LIMIT 200",userId,userId);
    }
    @PutMapping("/release-plans/{id}/reservation") @Transactional
    public Map<String,Boolean> reserve(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        var p=releases.lockPlan(id);
        if(!"SCHEDULED".equals(p.get("status"))) ReleaseService.conflict("这集已发布或排期已取消，请刷新查看");
        db.update("INSERT INTO user_reservation(user_id,plan_id) VALUES (?,?) ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id)",DramaController.userId(jwt),id);
        return Map.of("reserved",true);
    }
    @DeleteMapping("/release-plans/{id}/reservation") @Transactional
    public Map<String,Boolean> unreserve(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        releases.lockPlan(id);
        db.update("DELETE FROM user_reservation WHERE user_id=? AND plan_id=?",DramaController.userId(jwt),id);
        return Map.of("reserved",false);
    }

    @GetMapping("/admin/dramas/{id}/release-plans")
    public List<Map<String,Object>> adminPlans(@PathVariable long id) {
        return db.queryForList("""
            SELECT p.id,p.episode_no AS episodeNo,p.title,p.video_url AS videoUrl,p.publish_at AS publishAt,p.status,
              (SELECT COUNT(*) FROM user_reservation r WHERE r.plan_id=p.id) AS reservationCount
            FROM episode_release_plan p WHERE drama_id=? ORDER BY p.publish_at,p.id
            """,id);
    }
    @PostMapping("/admin/dramas/{id}/release-plans") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public List<Map<String,Object>> create(@PathVariable long id,@Valid @RequestBody PlanInput in) {
        releases.lockDrama(id); validate(id,0,in);
        db.update("INSERT INTO episode_release_plan(drama_id,episode_no,title,video_url,publish_at) VALUES (?,?,?,?,?)",id,in.episodeNo(),in.title().trim(),in.videoUrl(),in.publishAt());
        extendSeries(id,in.episodeNo()); return adminPlans(id);
    }
    @PutMapping("/admin/release-plans/{id}") @Transactional
    public Map<String,Boolean> edit(@PathVariable long id,@Valid @RequestBody PlanInput in) {
        var p=releases.lockPlan(id);
        if("PUBLISHED".equals(p.get("status"))) ReleaseService.conflict("这集已发布，请到分集管理编辑");
        long dramaId=((Number)p.get("drama_id")).longValue(); validate(dramaId,id,in);
        // A reservation refers to this exact episode. Rescheduling must not switch its identity.
        if(((Number)p.get("episode_no")).intValue()!=in.episodeNo()) ReleaseService.conflict("已有排期不能更改集号，请取消后另建排期");
        db.update("UPDATE episode_release_plan SET title=?,video_url=?,publish_at=?,status='SCHEDULED' WHERE id=?",in.title().trim(),in.videoUrl(),in.publishAt(),id);
        extendSeries(dramaId,in.episodeNo()); return Map.of("saved",true);
    }
    @PostMapping("/admin/release-plans/{id}/cancel") @Transactional
    public Map<String,Boolean> cancel(@PathVariable long id) {
        var p=releases.lockPlan(id);
        if("PUBLISHED".equals(p.get("status"))) ReleaseService.conflict("这集已发布，不能取消排期");
        db.update("UPDATE episode_release_plan SET status='CANCELLED' WHERE id=?",id);
        return Map.of("cancelled",true);
    }
    @PostMapping("/admin/release-plans/{id}/publish")
    public Map<String,Boolean> publish(@PathVariable long id) { releases.publish(id,true); return Map.of("published",true); }
    private void validate(long dramaId,long planId,PlanInput in) {
        AdminController.validateUrl(in.videoUrl());
        long now=System.currentTimeMillis();
        if(in.publishAt()<=now || in.publishAt()>now+Duration.ofDays(365).toMillis())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"发布时间需晚于现在，且在未来一年内");
        releases.ensureAvailable(dramaId,in.episodeNo(),planId);
    }
    private void extendSeries(long id,int no) {
        db.update("UPDATE drama_series SET status='SERIALIZING',total_episodes=GREATEST(total_episodes,?) WHERE drama_id=?",no,id);
    }

    @GetMapping("/me/notifications/count")
    public Map<String,Object> counts(@AuthenticationPrincipal Jwt jwt) { return countsFor(DramaController.userId(jwt)); }
    private Map<String,Object> countsFor(long userId) {
        return db.queryForMap("SELECT COUNT(CASE WHEN read_at IS NULL THEN 1 END) AS unreadCount,COALESCE(MAX(id),0) AS throughId FROM user_notification WHERE user_id=?",userId);
    }
    @GetMapping("/me/notifications")
    public Map<String,Object> inbox(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="false") boolean unread,@AuthenticationPrincipal Jwt jwt) {
        if(page<0||page>100000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"页码不正确");
        long userId=DramaController.userId(jwt);
        var result=countsFor(userId);
        result.put("items",db.queryForList("""
            SELECT n.id,n.created_at AS createdAt,n.read_at AS readAt,e.id AS episodeId,e.episode_no AS episodeNo,
              e.title,d.id AS dramaId,d.title AS dramaTitle,d.cover_img AS coverImg
            FROM user_notification n JOIN drama_episode e ON e.id=n.episode_id JOIN drama d ON d.id=e.drama_id
            WHERE n.user_id=? AND (?=false OR n.read_at IS NULL) ORDER BY n.id DESC LIMIT 20 OFFSET ?
            """,userId,unread,page*20));
        result.put("total",db.queryForObject("SELECT COUNT(*) FROM user_notification WHERE user_id=? AND (?=false OR read_at IS NULL)",Integer.class,userId,unread));
        return result;
    }
    @PutMapping("/me/notifications/{id}/read")
    public Map<String,Boolean> read(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        long userId=DramaController.userId(jwt);
        if(db.queryForObject("SELECT COUNT(*) FROM user_notification WHERE id=? AND user_id=?",Integer.class,id,userId)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"提醒不存在或已移除");
        db.update("UPDATE user_notification SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",System.currentTimeMillis(),id,userId);
        return Map.of("read",true);
    }
    @PutMapping("/me/notifications/read-all")
    public Map<String,Boolean> readAll(@Valid @RequestBody ReadAll in,@AuthenticationPrincipal Jwt jwt) {
        db.update("UPDATE user_notification SET read_at=? WHERE user_id=? AND read_at IS NULL AND id<=?",System.currentTimeMillis(),DramaController.userId(jwt),in.throughId());
        return Map.of("read",true);
    }
}
