package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** 商品行是规格配置、购买和返库的共同锁；已售规格永不物理删除。 */
@RestController
@RequestMapping("/api/shop/products")
public class ProductVariants {
    private final JdbcTemplate db;
    public ProductVariants(JdbcTemplate db) { this.db = db; }
    public record Input(@Positive(message="规格编号不正确") Long id,
        @NotBlank(message="请输入规格名称") @Size(max=80,message="规格名称最多80字") String name,
        @NotNull(message="请输入规格价格") @DecimalMin(value="0.01",message="规格价格需大于0") @Digits(integer=8,fraction=2,message="规格价格最多两位小数") BigDecimal price,
        @NotNull(message="请输入规格库存") @Min(value=0,message="规格库存不能为负数") @Max(value=999999,message="规格库存不能超过999999") Integer stock,
        boolean onSale) {}
    public record SaveInput(@NotNull(message="请刷新规格后再保存") @PositiveOrZero(message="版本不正确") Long version,
        @NotEmpty(message="至少保留一种规格") @Size(max=20,message="每件商品最多20种规格") List<@NotNull @Valid Input> items) {}
    public record Choice(Long skuId, String name, BigDecimal price, int stock) {}

    public List<Map<String,Object>> list(long id, boolean lock) {
        return db.queryForList("SELECT id,product_id AS productId,name,price,stock,on_sale AS onSale FROM product_variant WHERE product_id=? ORDER BY id" + (lock ? " FOR UPDATE" : ""), id);
    }
    @GetMapping("/{id}/variants")
    public Map<String,Object> read(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        var product = owned(id, DramaController.userId(jwt), false);
        return Map.of("version",product.get("version"),"items",list(id,false));
    }
    @PutMapping("/{id}/variants") @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String,Object> save(@PathVariable long id, @Valid @RequestBody SaveInput in, @AuthenticationPrincipal Jwt jwt) {
        var product = owned(id, DramaController.userId(jwt), true);
        if (number(product,"version") != in.version()) throw conflict("商品或库存已变化，请关闭规格窗口并刷新后重试");
        var old = list(id,true);
        Set<Long> oldIds = new HashSet<>();
        old.forEach(v -> oldIds.add(number(v,"id")));
        Set<Long> supplied = new HashSet<>(); Set<String> names = new HashSet<>();
        long total = 0;
        for (var v : in.items()) {
            if (!names.add(v.name().strip().toLowerCase(Locale.ROOT))) throw bad("规格名称不能重复");
            if (v.id()!=null && (!oldIds.contains(v.id()) || !supplied.add(v.id()))) throw bad("规格不属于当前商品或重复提交");
            total += v.stock();
        }
        if (!supplied.equals(oldIds)) throw bad("已有规格不能删除，可将不再销售的规格设为停售");
        if (total > 999999) throw bad("全部规格库存合计不能超过999999");
        if (old.isEmpty() && db.queryForObject("SELECT COUNT(*) FROM shop_order WHERE product_id=? AND status='PENDING'",Integer.class,id)>0)
            throw conflict("存在未付款的旧款订单，请处理或等待过期后再启用规格");
        for (var v : in.items()) {
            if (v.id()==null) {
                db.update("INSERT INTO product_variant(product_id,name,price,stock,on_sale) VALUES (?,?,?,?,?)",id,v.name().strip(),v.price(),v.stock(),v.onSale());
            } else {
                db.update("UPDATE product_variant SET name=?,price=?,stock=?,on_sale=? WHERE id=? AND product_id=?",v.name().strip(),v.price(),v.stock(),v.onSale(),v.id(),id);
            }
        }
        sync(id);
        return Map.of("version",db.queryForObject("SELECT version FROM shop_product WHERE id=?",Long.class,id),"items",list(id,false));
    }
    // Call only after locking the parent product in the encompassing transaction.
    public Choice choose(Map<String,Object> product, Long skuId) {
        var variants = list(number(product,"id"),true);
        if (variants.isEmpty()) {
            if (skuId!=null) throw conflict("这件商品没有所选规格，请刷新后重试");
            return new Choice(null,"",(BigDecimal)product.get("price"),(int)number(product,"stock"));
        }
        if (skuId==null) throw conflict("请选择商品规格后再购买");
        var selected = variants.stream().filter(v -> number(v,"id")==skuId).findFirst().orElseThrow(() -> conflict("规格不属于当前商品"));
        if (!Boolean.TRUE.equals(selected.get("onSale"))) throw conflict("所选规格已停售，请重新选择");
        return new Choice(skuId,(String)selected.get("name"),(BigDecimal)selected.get("price"),(int)number(selected,"stock"));
    }
    public void changeStock(long productId, Long skuId, int delta) {
        if (skuId==null) db.update("UPDATE shop_product SET stock=stock+?,version=version+1 WHERE id=?",delta,productId);
        else {
            db.update("UPDATE product_variant SET stock=stock+? WHERE id=? AND product_id=?",delta,skuId,productId);
            sync(productId);
        }
    }
    private void sync(long id) {
        var rows = list(id,true);
        var active = rows.stream().filter(v -> Boolean.TRUE.equals(v.get("onSale"))).toList();
        long stock = active.stream().mapToLong(v -> number(v,"stock")).sum();
        BigDecimal price = (active.isEmpty()?rows:active).stream().map(v -> (BigDecimal)v.get("price")).min(BigDecimal::compareTo).orElseThrow();
        db.update("UPDATE shop_product SET stock=?,price=?,version=version+1 WHERE id=?",stock,price,id);
    }
    private Map<String,Object> owned(long id,long owner,boolean lock) {
        var rows = db.queryForList("SELECT * FROM shop_product WHERE id=?"+(lock?" FOR UPDATE":""),id);
        if(rows.isEmpty() || db.queryForObject("SELECT COUNT(*) FROM shop WHERE id=? AND owner_id=? AND status='ACTIVE'",Integer.class,rows.getFirst().get("shop_id"),owner)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"商品不存在或不属于当前店铺");
        return rows.getFirst();
    }
    private static long number(Map<String,Object> row,String key) {return ((Number)row.get(key)).longValue();}
    private static ResponseStatusException conflict(String text) {return new ResponseStatusException(HttpStatus.CONFLICT,text);}
    private static ResponseStatusException bad(String text) {return new ResponseStatusException(HttpStatus.BAD_REQUEST,text);}
}
