package com.mujian;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class DramaRepository {
    private final JdbcTemplate db;
    public DramaRepository(JdbcTemplate db) { this.db = db; }
    private static final String SELECT = """
        SELECT d.id,d.title,d.cover_img AS coverImg,d.description,d.video_url AS videoUrl,
          d.category,d.view_count AS viewCount,d.create_time AS createTime,
          (SELECT COUNT(*) FROM user_like l WHERE l.drama_id=d.id) AS likeCount,
          (SELECT COUNT(*) FROM user_favorite f WHERE f.drama_id=d.id) AS favoriteCount,
          EXISTS(SELECT 1 FROM user_like l WHERE l.drama_id=d.id AND l.user_id=?) AS liked,
          EXISTS(SELECT 1 FROM user_favorite f WHERE f.drama_id=d.id AND f.user_id=?) AS favorited,
          EXISTS(SELECT 1 FROM user_follow f WHERE f.drama_id=d.id AND f.user_id=?) AS followed,
          COALESCE(s.status,'COMPLETED') AS seriesStatus,COALESCE(s.total_episodes,1) AS totalEpisodes,
          (SELECT COUNT(*) FROM drama_episode e WHERE e.drama_id=d.id) AS episodeCount
        FROM drama d LEFT JOIN drama_series s ON s.drama_id=d.id
        """;
    public List<Map<String,Object>> list(Long userId,String query,String category,String sort,boolean favorites) {
        var args = new ArrayList<Object>(); args.add(userId);args.add(userId);args.add(userId);
        String sql = SELECT + " WHERE 1=1";
        if (query != null && !query.isBlank()) { sql += " AND d.title LIKE ?"; args.add("%"+query.trim()+"%"); }
        if (category != null && !category.isBlank() && !category.equals("全部")) { sql += " AND d.category=?";args.add(category); }
        if (favorites) { sql += " AND EXISTS(SELECT 1 FROM user_favorite f WHERE f.drama_id=d.id AND f.user_id=?)"; args.add(userId); }
        sql += favorites ? " ORDER BY (SELECT f.create_time FROM user_favorite f WHERE f.drama_id=d.id AND f.user_id=?) DESC,d.id DESC" :
            ("popular".equals(sort) ? " ORDER BY d.view_count DESC,d.id DESC" : " ORDER BY d.id DESC");
        if (favorites) args.add(userId);
        return db.queryForList(sql+" LIMIT 200",args.toArray());
    }

    public List<Map<String,Object>> recommendations(Long userId) {
        var items = new ArrayList<>(list(userId, "", "", "popular", false));
        var preference = new HashMap<String, Integer>();
        if (userId != null) {
            db.queryForList("""
                SELECT category, SUM(score) AS score FROM (
                  SELECT d.category, COUNT(*) * 4 AS score
                  FROM user_follow f JOIN drama d ON d.id=f.drama_id
                  WHERE f.user_id=? GROUP BY d.category
                  UNION ALL
                  SELECT d.category, COUNT(*) * 3 AS score
                  FROM user_favorite f JOIN drama d ON d.id=f.drama_id
                  WHERE f.user_id=? GROUP BY d.category
                  UNION ALL
                  SELECT d.category, COUNT(*) AS score
                  FROM watch_history h JOIN drama d ON d.id=h.drama_id
                  WHERE h.user_id=? GROUP BY d.category
                ) preferences GROUP BY category ORDER BY score DESC
                """, userId, userId, userId).forEach(row -> preference.put(String.valueOf(row.get("category")), ((Number) row.get("score")).intValue()));
        }
        int maxPreference = preference.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        items.forEach(item -> {
            String category = String.valueOf(item.get("category"));
            int categoryScore = preference.getOrDefault(category, 0);
            long views = ((Number) item.getOrDefault("viewCount", 0)).longValue();
            int score = categoryScore * 100 + (int) Math.min(views, 99_999L) / 100;
            if (truthy(item.get("followed"))) score += 80;
            if (truthy(item.get("favorited"))) score += 60;
            item.put("recommendationScore", score);
            item.put("recommendationReason", categoryScore > 0
                ? "因为你喜欢「" + category + "」类故事"
                : maxPreference == 0 && views > 0 ? "正在热播，很多人正在看" : "为你挑选的新故事");
        });
        items.sort(Comparator.comparingInt(item -> -((Number) item.get("recommendationScore")).intValue()));
        return items.stream().limit(24).toList();
    }
    private static boolean truthy(Object value) {
        return Boolean.TRUE.equals(value) || value instanceof Number n && n.intValue() > 0;
    }
    public Map<String,Object> detail(long id,Long userId) {
        var rows = db.queryForList(SELECT+" WHERE d.id=?",userId,userId,userId,id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这部短剧不存在或已下架");
        var drama = rows.getFirst();
        if (userId != null) {
            var progress = db.queryForList("""
                SELECT progress_sec AS progressSec, duration_sec AS durationSec
                FROM watch_history WHERE user_id=? AND drama_id=?
                """, userId, id);
            if (!progress.isEmpty()) drama.putAll(progress.getFirst());
            var episode = db.queryForList("""
                SELECT e.id AS resumeEpisodeId,e.episode_no AS resumeEpisodeNo,
                       p.progress_sec AS progressSec,p.duration_sec AS durationSec
                FROM episode_progress p JOIN drama_episode e ON e.id=p.episode_id
                WHERE p.user_id=? AND e.drama_id=? ORDER BY p.last_watched DESC,e.id DESC LIMIT 1
                """,userId,id);
            if (!episode.isEmpty()) drama.putAll(episode.getFirst());
        }
        return drama;
    }
    public List<Map<String,Object>> following(long userId) {
        return db.queryForList(SELECT+"""
            JOIN user_follow uf ON uf.drama_id=d.id AND uf.user_id=?
            ORDER BY d.update_time DESC,d.id DESC LIMIT 200
            """,userId,userId,userId,userId);
    }
    public void require(long id) {
        if (db.queryForObject("SELECT COUNT(*) FROM drama WHERE id=?",Integer.class,id)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这部短剧不存在或已下架");
    }
}
