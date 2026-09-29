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
          EXISTS(SELECT 1 FROM user_favorite f WHERE f.drama_id=d.id AND f.user_id=?) AS favorited
        FROM drama d
        """;
    public List<Map<String,Object>> list(Long userId,String query,String category,String sort,boolean favorites) {
        var args = new ArrayList<Object>(); args.add(userId);args.add(userId);
        String sql = SELECT + " WHERE 1=1";
        if (query != null && !query.isBlank()) { sql += " AND d.title LIKE ?"; args.add("%"+query.trim()+"%"); }
        if (category != null && !category.isBlank() && !category.equals("全部")) { sql += " AND d.category=?";args.add(category); }
        if (favorites) { sql += " AND EXISTS(SELECT 1 FROM user_favorite f WHERE f.drama_id=d.id AND f.user_id=?)"; args.add(userId); }
        sql += favorites ? " ORDER BY (SELECT f.create_time FROM user_favorite f WHERE f.drama_id=d.id AND f.user_id=?) DESC,d.id DESC" :
            ("popular".equals(sort) ? " ORDER BY d.view_count DESC,d.id DESC" : " ORDER BY d.id DESC");
        if (favorites) args.add(userId);
        return db.queryForList(sql+" LIMIT 200",args.toArray());
    }
    public Map<String,Object> detail(long id,Long userId) {
        var rows = db.queryForList(SELECT+" WHERE d.id=?",userId,userId,id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这部短剧不存在或已下架");
        var drama = rows.getFirst();
        if (userId != null) {
            var progress = db.queryForList("""
                SELECT progress_sec AS progressSec, duration_sec AS durationSec
                FROM watch_history WHERE user_id=? AND drama_id=?
                """, userId, id);
            if (!progress.isEmpty()) drama.putAll(progress.getFirst());
        }
        return drama;
    }
    public void require(long id) {
        if (db.queryForObject("SELECT COUNT(*) FROM drama WHERE id=?",Integer.class,id)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这部短剧不存在或已下架");
    }
}
