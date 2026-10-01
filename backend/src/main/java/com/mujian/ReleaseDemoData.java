package com.mujian;

import java.time.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(30)
public class ReleaseDemoData implements CommandLineRunner {
    private final JdbcTemplate db;
    @Value("${app.seed-demo}") boolean seed;
    public ReleaseDemoData(JdbcTemplate db) { this.db=db; }
    @Override @Transactional public void run(String... args) {
        if(!seed) return;
        var samples=db.queryForList("SELECT id FROM drama WHERE title='第七封来信' AND video_url='/media/sintel-trailer.mp4'");
        for(var row:samples) {
            long id=((Number)row.get("id")).longValue();
            db.queryForList("SELECT id FROM drama WHERE id=? FOR UPDATE",id);
            if(!db.queryForList("SELECT id FROM episode_release_plan WHERE drama_id=? FOR UPDATE",id).isEmpty()) continue;
            if(!db.queryForList("SELECT id FROM drama_episode WHERE drama_id=? AND episode_no>=4 FOR UPDATE",id).isEmpty()) continue;
            long next=LocalDate.now(ZoneId.of("Asia/Shanghai")).plusDays(1).atTime(20,0).atZone(ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli();
            for(int n=4;n<=5;n++) db.update("INSERT INTO episode_release_plan(drama_id,episode_no,title,video_url,publish_at) VALUES (?,?,?,?,?)",id,n,"演示章节 "+n,"/media/sintel-trailer.mp4",next+Duration.ofDays(n-4).toMillis());
            db.update("UPDATE drama_series SET status='SERIALIZING',total_episodes=GREATEST(total_episodes,5) WHERE drama_id=?",id);
        }
    }
}
