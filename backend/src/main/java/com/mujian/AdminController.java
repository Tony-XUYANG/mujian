package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.net.URI;
import java.sql.Statement;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final JdbcTemplate db;
    private final DramaRepository dramas;
    public AdminController(JdbcTemplate db,DramaRepository dramas) {this.db=db;this.dramas=dramas;}
    public record Input(
        @NotBlank(message="请输入短剧标题") @Size(max=80,message="标题最多80字") String title,
        @NotBlank(message="请输入封面地址") @Size(max=1000) String coverImg,
        @NotBlank(message="请输入短剧简介") @Size(max=2000,message="简介最多2000字") String description,
        @NotBlank(message="请输入视频地址") @Size(max=1000) String videoUrl,
        @NotBlank(message="请选择分类") String category) {}
    public record ReportAction(@NotBlank(message="请选择处理方式") String action) {}
    @GetMapping("/stats") public Map<String,Object> stats() {
        return Map.of("dramas",db.queryForObject("SELECT COUNT(*) FROM drama",Long.class),
            "users",db.queryForObject("SELECT COUNT(*) FROM `user`",Long.class),
            "views",db.queryForObject("SELECT COALESCE(SUM(view_count),0) FROM drama",Long.class),
            "favorites",db.queryForObject("SELECT COUNT(*) FROM user_favorite",Long.class));
    }
    @GetMapping("/dramas") public List<Map<String,Object>> list(@RequestParam(defaultValue="") String q) {return dramas.list(null,q,"","latest",false);}
    @PostMapping("/dramas") @ResponseStatus(HttpStatus.CREATED) @org.springframework.transaction.annotation.Transactional
    public Map<String,Object> create(@Valid @RequestBody Input in) {
        validate(in);
        var key = new GeneratedKeyHolder();
        db.update(connection -> {
            var ps=connection.prepareStatement("INSERT INTO drama(title,cover_img,description,video_url,category) VALUES (?,?,?,?,?)",Statement.RETURN_GENERATED_KEYS);
            ps.setString(1,in.title().trim());ps.setString(2,in.coverImg());ps.setString(3,in.description().trim());ps.setString(4,in.videoUrl());ps.setString(5,in.category());return ps;
        },key);
        long id=Objects.requireNonNull(key.getKey()).longValue();
        db.update("INSERT INTO drama_series(drama_id) VALUES (?)",id);
        db.update("INSERT INTO drama_episode(drama_id,episode_no,title,video_url) VALUES (?,1,'正片',?)",id,in.videoUrl());
        return dramas.detail(id,null);
    }
    @PutMapping("/dramas/{id}") @org.springframework.transaction.annotation.Transactional
    public Map<String,Object> update(@PathVariable long id,@Valid @RequestBody Input in) {
        validate(in);dramas.require(id);
        db.queryForObject("SELECT id FROM drama WHERE id=? FOR UPDATE",Long.class,id);
        db.update("UPDATE drama SET title=?,cover_img=?,description=?,video_url=?,category=? WHERE id=?",in.title().trim(),in.coverImg(),in.description().trim(),in.videoUrl(),in.category(),id);
        db.update("UPDATE drama_episode SET video_url=? WHERE drama_id=? ORDER BY episode_no LIMIT 1",in.videoUrl(),id);
        return dramas.detail(id,null);
    }
    @DeleteMapping("/dramas/{id}") public Map<String,Object> delete(@PathVariable long id) {
        if(db.update("DELETE FROM drama WHERE id=?",id)==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"短剧不存在或已删除");
        return Map.of("message","短剧已删除");
    }

    @GetMapping("/comment-reports")
    public List<Map<String,Object>> commentReports(@RequestParam(defaultValue="PENDING") String status) {
        if (!Set.of("PENDING", "RESOLVED", "DISMISSED", "ALL").contains(status))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "评论审核状态不正确");
        return db.queryForList("""
            SELECT r.id,r.comment_id AS commentId,r.reason,r.status,r.create_time AS createTime,
              c.content,c.drama_id AS dramaId,d.title AS dramaTitle,
              author.nickname AS authorNickname,reporter.nickname AS reporterNickname,
              COALESCE(m.status,'VISIBLE') AS moderationStatus
            FROM drama_comment_report r
              JOIN drama_comment c ON c.id=r.comment_id
              JOIN drama d ON d.id=c.drama_id
              JOIN `user` author ON author.id=c.user_id
              JOIN `user` reporter ON reporter.id=r.user_id
              LEFT JOIN drama_comment_moderation m ON m.comment_id=c.id
            WHERE (?='ALL' OR r.status=?)
            ORDER BY FIELD(r.status,'PENDING','RESOLVED','DISMISSED'),r.create_time DESC,r.id DESC
            LIMIT 100
            """, status, status);
    }

    @PostMapping("/comment-reports/{id}/resolve")
    @Transactional
    public Map<String,Boolean> resolveCommentReport(@PathVariable long id, @Valid @RequestBody ReportAction input,
                                                    @AuthenticationPrincipal Jwt jwt) {
        if (!Set.of("HIDE", "DISMISS").contains(input.action()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择隐藏或驳回举报");
        var rows = db.queryForList("SELECT * FROM drama_comment_report WHERE id=? FOR UPDATE", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "举报不存在或已处理");
        var report = rows.getFirst();
        long commentId = ((Number) report.get("comment_id")).longValue();
        long moderatorId = DramaController.userId(jwt);
        if ("HIDE".equals(input.action())) {
            db.update("""
                INSERT INTO drama_comment_moderation(comment_id,status,reason,moderator_id)
                VALUES (?,'HIDDEN',?,?)
                ON DUPLICATE KEY UPDATE status='HIDDEN',reason=VALUES(reason),moderator_id=VALUES(moderator_id),updated_at=CURRENT_TIMESTAMP
                """, commentId, report.get("reason"), moderatorId);
        }
        db.update("UPDATE drama_comment_report SET status=?,resolved_time=CURRENT_TIMESTAMP,resolver_id=? WHERE id=?",
            "HIDE".equals(input.action()) ? "RESOLVED" : "DISMISSED", moderatorId, id);
        return Map.of("handled", true, "hidden", "HIDE".equals(input.action()));
    }

    @PostMapping("/comments/{id}/restore")
    @Transactional
    public Map<String,Boolean> restoreComment(@PathVariable long id) {
        if (db.update("UPDATE drama_comment_moderation SET status='VISIBLE',updated_at=CURRENT_TIMESTAMP WHERE comment_id=?", id) == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "评论没有隐藏记录");
        return Map.of("restored", true);
    }
    private void validate(Input in) {
        if(!Set.of("都市","悬疑","治愈","古装","爱情").contains(in.category())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择有效分类");
        validateUrl(in.coverImg());validateUrl(in.videoUrl());
    }
    static void validateUrl(String value) {
        try {
            URI uri = URI.create(value);
            if (value.startsWith("/media/") && !value.contains("..") && !value.contains("\\")) return;
            if (Set.of("http","https").contains(uri.getScheme()) && uri.getHost()!=null && uri.getUserInfo()==null) return;
        } catch(Exception ignored) {}
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资源地址需为 http/https 链接或 /media/ 本地路径");
    }
}
