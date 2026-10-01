package com.mujian;

import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class ReleaseService {
    private final JdbcTemplate db;
    private final TransactionTemplate transactions;
    public ReleaseService(JdbcTemplate db, TransactionTemplate transactions) { this.db=db; this.transactions=transactions; }

    // Recovery needs no in-memory timers: every startup scans the persisted due plans.
    @Scheduled(fixedDelayString="${app.release-scan-ms:10000}", initialDelay=5000)
    public void releaseDue() {
        var due=db.queryForList("SELECT id FROM episode_release_plan WHERE status='SCHEDULED' AND publish_at<=? ORDER BY publish_at,id LIMIT 50",Long.class,System.currentTimeMillis());
        for(long id:due) try { publish(id,false); }
        catch(Exception e) { LoggerFactory.getLogger(ReleaseService.class).error("Release plan {} failed; retained for retry",id,e); }
    }

    public Map<String,Object> publish(long planId, boolean immediately) {
        return transactions.execute(tx -> {
            var plan=lockPlan(planId);
            if(!"SCHEDULED".equals(plan.get("status"))) {
                if(immediately && "CANCELLED".equals(plan.get("status"))) conflict("排期已取消，请先重新排期");
                return plan;
            }
            long now=System.currentTimeMillis();
            if(!immediately && ((Number)plan.get("publish_at")).longValue()>now) return plan;
            long dramaId=((Number)plan.get("drama_id")).longValue();
            int number=((Number)plan.get("episode_no")).intValue();
            ensureAvailable(dramaId,number,planId);
            db.update("INSERT INTO drama_episode(drama_id,episode_no,title,video_url) VALUES (?,?,?,?)",dramaId,number,plan.get("title"),plan.get("video_url"));
            long episodeId=db.queryForObject("SELECT id FROM drama_episode WHERE drama_id=? AND episode_no=?",Long.class,dramaId,number);
            db.update("UPDATE episode_release_plan SET status='PUBLISHED',episode_id=?,published_at=? WHERE id=?",episodeId,now,planId);
            db.update("UPDATE drama_series SET status='SERIALIZING',total_episodes=GREATEST(total_episodes,?) WHERE drama_id=?",number,dramaId);
            db.update("UPDATE drama SET video_url=(SELECT video_url FROM drama_episode WHERE drama_id=? ORDER BY episode_no LIMIT 1),update_time=CURRENT_TIMESTAMP WHERE id=?",dramaId,dramaId);
            notifyPublished(dramaId,episodeId,planId);
            return db.queryForMap("SELECT * FROM episode_release_plan WHERE id=?",planId);
        });
    }

    // Called inside the same transaction as episode creation; UNION prevents two reminders
    // for someone who both follows the drama and reserves its new episode.
    void notifyPublished(long dramaId,long episodeId,long planId) {
        db.update("""
            INSERT INTO user_notification(user_id,episode_id,created_at)
            SELECT recipients.user_id,?,? FROM (
              SELECT user_id FROM user_follow WHERE drama_id=?
              UNION SELECT user_id FROM user_reservation WHERE plan_id=?
            ) recipients
            ON DUPLICATE KEY UPDATE episode_id=VALUES(episode_id)
            """,episodeId,System.currentTimeMillis(),dramaId,planId);
    }

    void lockDrama(long dramaId) {
        if(db.queryForList("SELECT id FROM drama WHERE id=? FOR UPDATE",dramaId).isEmpty())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"短剧不存在或已下架");
    }
    Map<String,Object> lockPlan(long id) {
        var rows=db.queryForList("SELECT drama_id FROM episode_release_plan WHERE id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"排期不存在或已下架");
        // Every publish/edit/reserve path takes the parent lock first, matching episode CRUD.
        lockDrama(((Number)rows.getFirst().get("drama_id")).longValue());
        rows=db.queryForList("SELECT * FROM episode_release_plan WHERE id=? FOR UPDATE",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"排期不存在或已下架");
        return rows.getFirst();
    }
    void ensureAvailable(long dramaId,int number,long exceptPlan) {
        if(!db.queryForList("SELECT id FROM drama_episode WHERE drama_id=? AND episode_no=? FOR UPDATE",dramaId,number).isEmpty())
            conflict("这部短剧已有第"+number+"集，请使用其他集号");
        ensureNotScheduled(dramaId,number,exceptPlan);
    }
    void ensureNotScheduled(long dramaId,int number,long exceptPlan) {
        // Current reads matter here: lockPlan's initial lookup may have created an older
        // REPEATABLE READ snapshot before another transaction released the drama lock.
        if(!db.queryForList("SELECT id FROM episode_release_plan WHERE drama_id=? AND episode_no=? AND status='SCHEDULED' AND id<>? FOR UPDATE",dramaId,number,exceptPlan).isEmpty())
            conflict("第"+number+"集已有发布计划，请在排期中修改或取消");
    }
    static void conflict(String message) { throw new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
