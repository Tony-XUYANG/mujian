package com.mujian;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Archiving changes visibility only. Product drafts and order snapshots keep valid URLs. */
@RestController
@RequestMapping("/api/shop/media/images")
public class ShopMediaLibrary {
    private final JdbcTemplate db;
    public ShopMediaLibrary(JdbcTemplate db) { this.db = db; }

    private static final String MEDIA = """
        SELECT m.id, m.url, m.byte_size AS bytes, m.width, m.height, m.create_time AS createTime,
          COALESCE(d.display_name,CONCAT('商品图片 #',m.id)) AS name,
          COALESCE(d.archived,0) AS archived,
          (SELECT COUNT(*) FROM shop_product p WHERE p.shop_id=m.shop_id AND (
            p.image_url=m.url OR EXISTS (SELECT 1 FROM shop_product_detail pd WHERE pd.product_id=p.id
              AND JSON_CONTAINS(pd.image_urls,JSON_QUOTE(m.url)))
            OR EXISTS (SELECT 1 FROM product_variant v JOIN product_variant_image vi ON vi.variant_id=v.id
              WHERE v.product_id=p.id AND vi.image_url=m.url))) AS productCount,
          (SELECT COUNT(*) FROM shop_order o WHERE o.shop_id=m.shop_id AND o.image_url=m.url) AS orderCount
        FROM shop_media m LEFT JOIN shop_media_details d ON d.media_id=m.id WHERE m.shop_id=?
        """;

    @GetMapping
    @Transactional(readOnly=true)
    public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="") String q, @RequestParam(defaultValue="all") String usage,
            @RequestParam(defaultValue="false") boolean archived,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="12") int size) {
        long shopId=shop(jwt);
        if (page<0 || page>10000 || size<1 || size>24 || q.length()>80) throw bad("搜索或分页参数不正确");
        String usageSql=switch(usage) {
            case "all" -> "";
            case "products" -> " AND productCount>0";
            case "orders" -> " AND orderCount>0";
            case "unused" -> " AND productCount=0 AND orderCount=0";
            default -> throw bad("请选择有效的图片用途");
        };
        String filtered=" FROM ("+MEDIA+") library WHERE archived=? AND INSTR(name,?)>0"+usageSql;
        long total=db.queryForObject("SELECT COUNT(*)"+filtered,Long.class,shopId,archived,q.strip());
        int pages=(int)((total+size-1)/size), current=Math.min(page,Math.max(0,pages-1));
        var items=db.queryForList("SELECT *"+filtered+" ORDER BY createTime DESC,id DESC LIMIT ? OFFSET ?",
            shopId,archived,q.strip(),size,current*size);
        var stats=db.queryForMap("""
            SELECT COUNT(*) AS retained,COALESCE(SUM(byte_size),0) AS bytes,
              COALESCE(SUM(create_time>DATE_SUB(NOW(),INTERVAL 1 HOUR)),0) AS hourlyUploads
            FROM shop_media WHERE shop_id=?
            """,shopId);
        stats.put("limit",500); stats.put("hourlyLimit",60);
        return Map.of("items",items,"total",total,"page",current,"pages",pages,"stats",stats);
    }

    public record Rename(String name) {}
    @PatchMapping("/{id}/name")
    @Transactional
    public Map<String,Object> rename(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody Rename input) {
        own(jwt,id);
        String name=input.name()==null ? "" : input.name().strip();
        if (name.isEmpty() || name.length()>80 || name.codePoints().anyMatch(Character::isISOControl))
            throw bad("图片名称需为1至80字，不能包含控制字符");
        // Update only the requested field so a simultaneous archive is not lost.
        db.update("INSERT INTO shop_media_details(media_id,display_name) VALUES (?,?) ON DUPLICATE KEY UPDATE display_name=?",id,name,name);
        return Map.of("id",id,"name",name);
    }

    public record Archive(Boolean archived) {}
    @PutMapping("/{id}/archive")
    @Transactional
    public Map<String,Object> archive(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody Archive input) {
        own(jwt,id);
        if(input.archived()==null) throw bad("请选择收起或恢复图片");
        db.update("INSERT INTO shop_media_details(media_id,archived) VALUES (?,?) ON DUPLICATE KEY UPDATE archived=?",id,input.archived(),input.archived());
        return Map.of("id",id,"archived",input.archived());
    }

    private long shop(Jwt jwt) {
        var shops=db.queryForList("SELECT id FROM shop WHERE owner_id=? AND status='ACTIVE'",DramaController.userId(jwt));
        if(shops.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"请先开通店铺，再管理图片素材");
        return ((Number)shops.getFirst().get("id")).longValue();
    }
    private void own(Jwt jwt,long id) {
        if(db.queryForObject("SELECT COUNT(*) FROM shop_media WHERE id=? AND shop_id=?",Long.class,id,shop(jwt))==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"图片不存在或不属于当前店铺");
    }
    private static ResponseStatusException bad(String text) {return new ResponseStatusException(HttpStatus.BAD_REQUEST,text);}
}
