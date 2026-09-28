package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class EngagementController {
    private final JdbcTemplate db;
    private final DramaRepository dramas;

    public EngagementController(JdbcTemplate db, DramaRepository dramas) {
        this.db = db;
        this.dramas = dramas;
    }

    public record Progress(@Min(0) @Max(86400) int progressSec,
                           @Min(0) @Max(86400) int durationSec) {}
    public record Comment(@NotBlank(message = "评论不能为空") @Size(max = 500, message = "评论最多500字") String content) {}

    @GetMapping("/me/history")
    public List<Map<String, Object>> history(@AuthenticationPrincipal Jwt jwt) {
        long userId = DramaController.userId(jwt);
        return db.queryForList("""
            SELECT d.id,d.title,d.cover_img AS coverImg,d.description,d.video_url AS videoUrl,
              d.category,d.view_count AS viewCount,d.create_time AS createTime,
              h.progress_sec AS progressSec,h.duration_sec AS durationSec,h.last_watched AS lastWatched,
              (SELECT COUNT(*) FROM user_like l WHERE l.drama_id=d.id) AS likeCount,
              (SELECT COUNT(*) FROM user_favorite f WHERE f.drama_id=d.id) AS favoriteCount
            FROM watch_history h JOIN drama d ON d.id=h.drama_id
            WHERE h.user_id=? ORDER BY h.last_watched DESC LIMIT 100
            """, userId);
    }

    @PutMapping("/dramas/{id}/progress")
    public Map<String, Object> progress(@PathVariable long id, @Valid @RequestBody Progress input,
                                        @AuthenticationPrincipal Jwt jwt) {
        dramas.require(id);
        long userId = DramaController.userId(jwt);
        int progress = Math.min(input.progressSec(), input.durationSec() > 0 ? input.durationSec() : input.progressSec());
        db.update("""
            INSERT INTO watch_history(user_id,drama_id,progress_sec,duration_sec)
            VALUES (?,?,?,?)
            ON DUPLICATE KEY UPDATE progress_sec=VALUES(progress_sec),duration_sec=VALUES(duration_sec),last_watched=CURRENT_TIMESTAMP
            """, userId, id, progress, input.durationSec());
        return Map.of("saved", true, "progressSec", progress, "durationSec", input.durationSec());
    }

    @DeleteMapping("/me/history/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeHistory(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        db.update("DELETE FROM watch_history WHERE user_id=? AND drama_id=?", DramaController.userId(jwt), id);
    }

    @GetMapping("/dramas/{id}/comments")
    public List<Map<String, Object>> comments(@PathVariable long id) {
        dramas.require(id);
        return db.queryForList("""
            SELECT c.id,c.content,c.create_time AS createTime,u.nickname,
              LEFT(u.nickname,1) AS avatar
            FROM drama_comment c JOIN `user` u ON u.id=c.user_id
            WHERE c.drama_id=? ORDER BY c.create_time DESC LIMIT 100
            """, id);
    }

    @PostMapping("/dramas/{id}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addComment(@PathVariable long id, @Valid @RequestBody Comment input,
                                          @AuthenticationPrincipal Jwt jwt) {
        dramas.require(id);
        long userId = DramaController.userId(jwt);
        db.update("INSERT INTO drama_comment(user_id,drama_id,content) VALUES (?,?,?)",
            userId, id, input.content().trim());
        return db.queryForMap("""
            SELECT c.id,c.content,c.create_time AS createTime,u.nickname,LEFT(u.nickname,1) AS avatar
            FROM drama_comment c JOIN `user` u ON u.id=c.user_id
            WHERE c.user_id=? AND c.drama_id=? ORDER BY c.id DESC LIMIT 1
            """, userId, id);
    }
}
