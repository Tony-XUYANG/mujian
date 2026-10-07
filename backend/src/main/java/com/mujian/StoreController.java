package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
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

/** 店铺、商品、店主发布及视频商品挂载。所有写操作均以登录身份验证归属。 */
@RestController
@RequestMapping("/api")
public class StoreController {
    private final JdbcTemplate db;
    private final DramaRepository dramas;
    private final ProductDetails details;
    private final ProductVariants variants;
    private final ProductAttributeMatrix attributes;
    private final ShopMedia media;
    static final String PRODUCT = """
        SELECT p.id,p.name,p.image_url AS imageUrl,p.description,p.price,p.stock,p.status,p.version,
          s.id AS shopId,s.name AS shopName,s.logo_url AS shopLogoUrl,
          COALESCE(pd.category,'生活日用') AS category,COALESCE(pd.material,'') AS material,
          COALESCE(pd.specification,'') AS specification,COALESCE(pd.origin,'') AS origin,
          COALESCE(pd.shipping_from,'') AS shippingFrom,COALESCE(pd.detail_text,'') AS detailText,
          COALESCE(CAST(pd.image_urls AS CHAR),'[]') AS imagesJson,
          (SELECT COALESCE(SUM(o.quantity),0) FROM shop_order o WHERE o.product_id=p.id AND o.status='COMPLETED') AS soldCount,
          EXISTS(SELECT 1 FROM product_variant pv WHERE pv.product_id=p.id) AS hasVariants
        FROM shop_product p JOIN shop s ON s.id=p.shop_id
        LEFT JOIN shop_product_detail pd ON pd.product_id=p.id
        """;
    private static final String SHOP = "SELECT id,name,logo_url AS logoUrl,description,status FROM shop ";
    public StoreController(JdbcTemplate db, DramaRepository dramas,ProductDetails details,ProductVariants variants,ProductAttributeMatrix attributes,ShopMedia media) { this.db=db; this.dramas=dramas; this.details=details; this.variants=variants; this.attributes=attributes; this.media=media; }

    public record ShopInput(
        @NotBlank(message="请输入店铺名称") @Size(max=80,message="店铺名称最多80字") String name,
        @Size(max=1000,message="店铺头像地址过长") String logoUrl,
        @Size(max=500,message="店铺简介最多500字") String description) {}
    public record ProductInput(
        @NotBlank(message="请输入商品名称") @Size(max=120,message="商品名称最多120字") String name,
        @Size(max=1000,message="商品图片地址过长") String imageUrl,
        @Size(max=500,message="商品简介最多500字") String description,
        @NotNull(message="请输入商品价格") @DecimalMin(value="0.01",message="价格需大于0") @Digits(integer=8,fraction=2,message="价格最多两位小数") BigDecimal price,
        @NotNull(message="请输入库存") @Min(value=0,message="库存不能为负数") @Max(value=999999,message="库存不能超过999999") Integer stock,
        @PositiveOrZero(message="商品版本不正确") Long version,
        @Valid ProductDetails.Input details) {}
    public record SaleInput(@NotNull(message="请选择上下架状态") Boolean onSale) {}
    public record ProductLinks(@NotNull(message="请选择商品") @Size(max=6,message="最多挂载6件商品") List<@NotNull(message="商品编号不能为空") Long> productIds) {}
    public record VideoInput(@NotNull(message="请填写视频信息") @Valid AdminController.Input video,
        @NotNull(message="请选择商品") @Size(max=6,message="最多挂载6件商品") List<@NotNull(message="商品编号不能为空") Long> productIds) {}

    @GetMapping("/mall/products")
    public List<Map<String,Object>> products(@RequestParam(defaultValue="") String q,
            @RequestParam(required=false) Long shopId, @RequestParam(defaultValue="latest") String sort,
            @RequestParam(defaultValue="") String category,@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="24") int size,@RequestParam(defaultValue="false") boolean inStock,
            @RequestParam(required=false) BigDecimal minPrice,@RequestParam(required=false) BigDecimal maxPrice) {
        if(q.length()>100) throw bad("搜索关键词最多100字");
        if(page<0||page>10000||size<1||size>100)throw bad("分页参数不正确");
        if(!category.isEmpty()&&!ProductDetails.CATEGORIES.contains(category))throw bad("请选择有效商品分类");
        if((minPrice!=null&&minPrice.signum()<0)||(maxPrice!=null&&maxPrice.signum()<0)||(minPrice!=null&&maxPrice!=null&&minPrice.compareTo(maxPrice)>0))throw bad("价格区间不正确");
        String order=switch(sort) { case "priceAsc" -> "p.price,p.id DESC"; case "priceDesc" -> "p.price DESC,p.id DESC";
            case "sales" -> "soldCount DESC,p.id DESC";
            case "latest" -> "p.id DESC"; default -> throw bad("请选择有效排序方式"); };
        return db.queryForList(PRODUCT+" WHERE p.status='ON_SALE' AND s.status='ACTIVE' AND (? IS NULL OR s.id=?) AND (?='' OR p.name LIKE CONCAT('%',?,'%') OR p.description LIKE CONCAT('%',?,'%')) AND (?='' OR COALESCE(pd.category,'生活日用')=?) AND (?=false OR p.stock>0) AND (? IS NULL OR p.price>=?) AND (? IS NULL OR p.price<=?) ORDER BY "+order+" LIMIT ? OFFSET ?",
            shopId,shopId,q.trim(),q.trim(),q.trim(),category,category,inStock,minPrice,minPrice,maxPrice,maxPrice,size,page*size);
    }
    @GetMapping("/mall/products/{id}")
    public Map<String,Object> product(@PathVariable long id) { return productRow(id,false); }
    @GetMapping("/mall/shops/{id}")
    public Map<String,Object> shop(@PathVariable long id) { return Map.of("shop",shopRow(id),"products",productsForShop(id,false)); }
    @GetMapping("/dramas/{id}/products")
    public List<Map<String,Object>> dramaProducts(@PathVariable long id) {
        dramas.require(id);
        return db.queryForList(PRODUCT+" JOIN drama_product dp ON dp.product_id=p.id WHERE dp.drama_id=? AND p.status='ON_SALE' AND s.status='ACTIVE' ORDER BY dp.sort_order,dp.product_id LIMIT 6",id);
    }
    @GetMapping("/shop/me")
    public Map<String,Object> myShop(@AuthenticationPrincipal Jwt jwt) {
        var rows=db.queryForList(SHOP+"WHERE owner_id=?",DramaController.userId(jwt));
        var result=new HashMap<String,Object>();
        result.put("shop",rows.isEmpty()?null:rows.getFirst());
        result.put("products",rows.isEmpty()?List.of():productsForShop(number(rows.getFirst(),"id"),true));
        return result;
    }
    @PostMapping("/shop/register") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> registerShop(@Valid @RequestBody ShopInput in,@AuthenticationPrincipal Jwt jwt) {
        long owner=DramaController.userId(jwt);
        // 同一用户并发开店串行化，数据库唯一约束作为最后防线。
        db.queryForObject("SELECT id FROM `user` WHERE id=? FOR UPDATE",Long.class,owner);
        if(!db.queryForList("SELECT id FROM shop WHERE owner_id=?",owner).isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"你已经开通店铺，请进入我的店铺管理");
        optionalUrl(in.logoUrl());
        long id=insert("INSERT INTO shop(owner_id,name,logo_url,description) VALUES (?,?,?,?)",owner,in.name().trim(),clean(in.logoUrl()),clean(in.description()));
        return shopRow(id);
    }
    @PatchMapping("/shop/me")
    public Map<String,Object> updateShop(@Valid @RequestBody ShopInput in,@AuthenticationPrincipal Jwt jwt) {
        long id=ownerShopId(jwt);optionalUrl(in.logoUrl());
        db.update("UPDATE shop SET name=?,logo_url=?,description=? WHERE id=?",in.name().trim(),clean(in.logoUrl()),clean(in.description()),id);
        return shopRow(id);
    }
    @GetMapping("/shop/products")
    public List<Map<String,Object>> myProducts(@AuthenticationPrincipal Jwt jwt) { return productsForShop(ownerShopId(jwt),true); }
    @PostMapping("/shop/products") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> addProduct(@Valid @RequestBody ProductInput in,@AuthenticationPrincipal Jwt jwt) {
        long shopId=ownerShopId(jwt);media.validate(shopId,in.imageUrl());
        long id=insert("INSERT INTO shop_product(shop_id,name,image_url,description,price,stock) VALUES (?,?,?,?,?,?)",shopId,in.name().trim(),clean(in.imageUrl()),clean(in.description()),in.price(),in.stock());
        details.save(id,in.details());
        return productRow(id,true);
    }
    @PatchMapping("/shop/products/{id}") @Transactional
    public Map<String,Object> updateProduct(@PathVariable long id,@Valid @RequestBody ProductInput in,@AuthenticationPrincipal Jwt jwt) {
        long shopId=ownerShopId(jwt);media.validate(shopId,in.imageUrl());requireProduct(id,shopId);
        if(in.version()==null)throw bad("请刷新商品资料后再编辑");
        var locked=db.queryForMap("SELECT * FROM shop_product WHERE id=? FOR UPDATE",id);
        if(!variants.list(id,true).isEmpty() && (in.stock()!=number(locked,"stock") || in.price().compareTo((BigDecimal)locked.get("price"))!=0))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"多规格商品请在规格库存中修改价格和库存");
        if(db.update("UPDATE shop_product SET name=?,image_url=?,description=?,price=?,stock=?,version=version+1 WHERE id=? AND shop_id=? AND version=?",in.name().trim(),clean(in.imageUrl()),clean(in.description()),in.price(),in.stock(),id,shopId,in.version())==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"商品或库存已变化，请关闭表单并刷新后重试");
        details.save(id,in.details());
        return productRow(id,true);
    }
    @PutMapping("/shop/products/{id}/status")
    public Map<String,Object> sale(@PathVariable long id,@Valid @RequestBody SaleInput in,@AuthenticationPrincipal Jwt jwt) {
        long shopId=ownerShopId(jwt);requireProduct(id,shopId);
        db.update("UPDATE shop_product SET status=? WHERE id=? AND shop_id=?",in.onSale()?"ON_SALE":"OFF_SALE",id,shopId);
        return productRow(id,true);
    }
    @GetMapping("/shop/videos")
    public List<Map<String,Object>> videos(@AuthenticationPrincipal Jwt jwt) {
        var rows=db.queryForList("SELECT d.id,d.title,d.cover_img AS coverImg,d.description,d.video_url AS videoUrl,d.category FROM drama d JOIN shop_video v ON v.drama_id=d.id WHERE v.shop_id=? ORDER BY d.id DESC",ownerShopId(jwt));
        for(var row:rows)row.put("productIds",db.queryForList("SELECT product_id FROM drama_product WHERE drama_id=? ORDER BY sort_order",Long.class,row.get("id")));
        return rows;
    }
    @PostMapping("/shop/videos") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> publish(@Valid @RequestBody VideoInput in,@AuthenticationPrincipal Jwt jwt) {
        long shopId=ownerShopId(jwt);var v=in.video();validateVideo(v);
        long id=insert("INSERT INTO drama(title,cover_img,description,video_url,category) VALUES (?,?,?,?,?)",v.title().trim(),v.coverImg(),v.description().trim(),v.videoUrl(),v.category());
        db.update("INSERT INTO drama_series(drama_id) VALUES (?)",id);
        db.update("INSERT INTO drama_episode(drama_id,episode_no,title,video_url) VALUES (?,1,'正片',?)",id,v.videoUrl());
        db.update("INSERT INTO shop_video(drama_id,shop_id) VALUES (?,?)",id,shopId);
        setLinks(id,in.productIds(),shopId);
        return dramas.detail(id,DramaController.userId(jwt));
    }
    @PutMapping("/shop/videos/{id}/products") @Transactional
    public Map<String,Object> videoLinks(@PathVariable long id,@Valid @RequestBody ProductLinks in,@AuthenticationPrincipal Jwt jwt) {
        long shopId=ownerShopId(jwt);
        if(db.queryForList("SELECT drama_id FROM shop_video WHERE drama_id=? AND shop_id=? FOR UPDATE",id,shopId).isEmpty())throw missing("视频不存在或不属于当前店铺");
        setLinks(id,in.productIds(),shopId);return Map.of("linked",in.productIds().stream().distinct().count());
    }
    @DeleteMapping("/shop/videos/{id}") @Transactional
    public Map<String,Boolean> deleteVideo(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        long shopId=ownerShopId(jwt);
        if(db.queryForList("SELECT drama_id FROM shop_video WHERE drama_id=? AND shop_id=? FOR UPDATE",id,shopId).isEmpty())throw missing("视频不存在或不属于当前店铺");
        db.update("DELETE FROM drama WHERE id=?",id);return Map.of("removed",true);
    }
    @PutMapping("/admin/dramas/{id}/products") @Transactional
    public Map<String,Object> adminLinks(@PathVariable long id,@Valid @RequestBody ProductLinks in) {
        if(db.queryForList("SELECT id FROM drama WHERE id=? FOR UPDATE",id).isEmpty())throw missing("短剧不存在");
        setLinks(id,in.productIds(),null);return Map.of("linked",in.productIds().stream().distinct().count());
    }
    private void setLinks(long dramaId,List<Long> input,Long shopId) {
        var ids=input.stream().distinct().toList();
        // 全部事务按商品编号加锁，避免不同挂载顺序造成死锁。
        for(long id:ids.stream().sorted().toList()) {
            var rows=db.queryForList("SELECT id FROM shop_product WHERE id=? AND status='ON_SALE' AND (? IS NULL OR shop_id=?) AND shop_id IN (SELECT id FROM shop WHERE status='ACTIVE') FOR UPDATE",id,shopId,shopId);
            if(rows.isEmpty())throw bad(shopId==null?"只能挂载在售商品":"只能挂载自己店铺的在售商品");
        }
        db.update("DELETE FROM drama_product WHERE drama_id=?",dramaId);
        for(int i=0;i<ids.size();i++)db.update("INSERT INTO drama_product(drama_id,product_id,sort_order) VALUES (?,?,?)",dramaId,ids.get(i),i);
    }
    private void validateVideo(AdminController.Input v) {
        if(!Set.of("都市","悬疑","治愈","古装","爱情").contains(v.category()))throw bad("请选择有效分类");
        AdminController.validateUrl(v.coverImg());AdminController.validateUrl(v.videoUrl());
    }
    private long ownerShopId(Jwt jwt) {
        var rows=db.queryForList("SELECT id FROM shop WHERE owner_id=? AND status='ACTIVE'",DramaController.userId(jwt));
        if(rows.isEmpty())throw missing("请先开通店铺");return number(rows.getFirst(),"id");
    }
    private void requireProduct(long id,long shopId) {
        if(db.queryForList("SELECT id FROM shop_product WHERE id=? AND shop_id=?",id,shopId).isEmpty())throw missing("商品不存在或不属于当前店铺");
    }
    private Map<String,Object> shopRow(long id) {
        var rows=db.queryForList(SHOP+"WHERE id=? AND status='ACTIVE'",id);
        if(rows.isEmpty())throw missing("店铺不存在或已关闭");return rows.getFirst();
    }
    private List<Map<String,Object>> productsForShop(long id,boolean all) {
        return db.queryForList(PRODUCT+" WHERE p.shop_id=? AND (? OR (p.status='ON_SALE' AND s.status='ACTIVE')) ORDER BY p.id DESC",id,all);
    }
    private Map<String,Object> productRow(long id,boolean all) {
        var rows=db.queryForList(PRODUCT+" WHERE p.id=? AND (? OR (p.status='ON_SALE' AND s.status='ACTIVE'))",id,all);
        if(rows.isEmpty())throw missing("商品不存在或已下架");
        var row=rows.getFirst();
        row.put("variants",attributes.publicVariants(id));
        row.put("attributeGroups",attributes.publicGroups(id));
        return row;
    }
    private long insert(String sql,Object... args) {
        var key=new GeneratedKeyHolder();db.update(c->{var ps=c.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<args.length;i++)ps.setObject(i+1,args[i]);return ps;},key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
    private static long number(Map<String,Object> row,String key) { return ((Number)row.get(key)).longValue(); }
    private static String clean(String s) { return s==null||s.isBlank()?null:s.trim(); }
    private static void optionalUrl(String s) { if(s!=null&&!s.isBlank())AdminController.validateUrl(s.trim()); }
    private static ResponseStatusException missing(String s) { return new ResponseStatusException(HttpStatus.NOT_FOUND,s); }
    private static ResponseStatusException bad(String s) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,s); }
}
