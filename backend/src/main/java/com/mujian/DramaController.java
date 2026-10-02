package com.mujian;

import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class DramaController {
    private final DramaRepository dramas;
    private final JdbcTemplate db;
    public DramaController(DramaRepository dramas,JdbcTemplate db) { this.dramas=dramas;this.db=db; }
    static Long userId(Jwt jwt) { return jwt == null ? null : Long.valueOf(jwt.getSubject()); }
    @GetMapping("/health") public Map<String,Object> health() {
        return Map.of("status","UP","database",db.queryForObject("SELECT 1",Integer.class)==1 ? "connected" : "down");
    }
    @GetMapping("/dramas") public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt,
        @RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String category,@RequestParam(defaultValue="latest") String sort) {
        return dramas.list(userId(jwt),q,category,sort,false);
    }
    @GetMapping("/recommendations") public List<Map<String,Object>> recommendations(@AuthenticationPrincipal Jwt jwt) {
        return dramas.recommendations(userId(jwt));
    }
    @GetMapping("/dramas/{id}") public Map<String,Object> detail(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        return dramas.detail(id,userId(jwt));
    }
    @GetMapping("/me/favorites") public List<Map<String,Object>> favorites(@AuthenticationPrincipal Jwt jwt) {
        return dramas.list(userId(jwt),"","","latest",true);
    }
    @PostMapping("/dramas/{id}/view") public Map<String,Object> view(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        dramas.require(id); db.update("UPDATE drama SET view_count=view_count+1 WHERE id=?",id);
        return dramas.detail(id,userId(jwt));
    }
    @PutMapping("/dramas/{id}/like") public Map<String,Object> like(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) { return interact(id,jwt,"user_like",true); }
    @DeleteMapping("/dramas/{id}/like") public Map<String,Object> unlike(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) { return interact(id,jwt,"user_like",false); }
    @PutMapping("/dramas/{id}/favorite") public Map<String,Object> favorite(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) { return interact(id,jwt,"user_favorite",true); }
    @DeleteMapping("/dramas/{id}/favorite") public Map<String,Object> unfavorite(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) { return interact(id,jwt,"user_favorite",false); }
    private Map<String,Object> interact(long id,Jwt jwt,String table,boolean add) {
        dramas.require(id);
        if(add) {
            try { db.update("INSERT INTO "+table+" (user_id,drama_id) VALUES (?,?)",userId(jwt),id); }
            catch(DuplicateKeyException ignored) { /* A retry keeps the same final state. */ }
        } else db.update("DELETE FROM "+table+" WHERE user_id=? AND drama_id=?",userId(jwt),id);
        return dramas.detail(id,userId(jwt));
    }
}
