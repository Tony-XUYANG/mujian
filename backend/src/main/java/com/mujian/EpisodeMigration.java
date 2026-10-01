package com.mujian;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Additive migration: series metadata is also the per-drama migration marker. */
@Component
@Order(20)
public class EpisodeMigration implements CommandLineRunner {
    private final JdbcTemplate db;
    @Value("${app.seed-demo}") boolean seed;
    public EpisodeMigration(JdbcTemplate db) { this.db = db; }
    @Override @Transactional
    public void run(String... args) {
        var legacy = db.queryForList("SELECT id,title,video_url FROM drama WHERE id NOT IN (SELECT drama_id FROM drama_series)");
        for (var d : legacy) {
            long id = ((Number)d.get("id")).longValue();
            boolean sample = seed && "/media/sintel-trailer.mp4".equals(d.get("video_url"))
                && ("长街听风".equals(d.get("title")) || "第七封来信".equals(d.get("title")));
            int count = sample ? 3 : 1;
            boolean serial = sample && "第七封来信".equals(d.get("title"));
            db.update("INSERT INTO drama_series(drama_id,status,total_episodes) VALUES (?,?,?)", id, serial ? "SERIALIZING" : "COMPLETED", serial ? 5 : count);
            for (int n = 1; n <= count; n++) db.update("INSERT INTO drama_episode(drama_id,episode_no,title,video_url) VALUES (?,?,?,?)",
                id,n,sample ? "演示章节 "+n : "正片",d.get("video_url"));
            db.update("""
                INSERT INTO episode_progress(user_id,episode_id,progress_sec,duration_sec,last_watched)
                SELECT h.user_id,e.id,h.progress_sec,h.duration_sec,h.last_watched
                FROM watch_history h JOIN drama_episode e ON e.drama_id=h.drama_id AND e.episode_no=1
                WHERE h.drama_id=?
                """,id);
        }
    }
}
