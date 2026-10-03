package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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

@RestController
@RequestMapping("/api/me")
public class ShoppingController {
    private final JdbcTemplate db;
    private final CommerceOrders orders;
    public ShoppingController(JdbcTemplate db,CommerceOrders orders){this.db=db;this.orders=orders;}
    public record Quantity(@Min(value=1,message="至少选择1件") @Max(value=99,message="单件商品最多99件") int quantity){}
    public record AddressInput(
        @NotBlank(message="请输入收货人") @Size(max=40,message="收货人最多40字") String recipient,
        @NotBlank(message="请输入联系电话") @Pattern(regexp="[0-9+ ()-]{6,24}",message="请输入有效联系电话") String phone,
        @NotBlank(message="请输入所在地区") @Size(max=100,message="地区最多100字") String region,
        @NotBlank(message="请输入详细地址") @Size(min=5,max=180,message="详细地址需为5至180字") String detail,
        @NotBlank(message="请选择地址标签") @Pattern(regexp="家|公司|其他",message="地址标签不正确") String label,
        boolean isDefault){}
    public record CheckoutLine(@Positive(message="商品编号不正确") long productId,
        @Min(value=1,message="至少选择1件") @Max(value=99,message="单件商品最多99件") int quantity,
        @NotNull(message="请重新确认商品价格") @DecimalMin(value="0.01",message="价格不正确") @Digits(integer=8,fraction=2,message="价格最多两位小数") BigDecimal expectedPrice){}
    public record CheckoutInput(@Positive(message="请选择收货地址") long addressId,
        @NotEmpty(message="请选择结算商品") @Size(max=20,message="一次最多结算20种商品") List<@NotNull(message="结算商品不能为空") @Valid CheckoutLine> items,
        @NotBlank(message="缺少结算标识") @Pattern(regexp="[A-Za-z0-9_-]{16,64}",message="结算标识不正确") String requestKey){}

    @GetMapping("/cart")
    public List<Map<String,Object>> cart(@AuthenticationPrincipal Jwt jwt) {
        return db.queryForList(StoreController.PRODUCT.replace("SELECT p.id", "SELECT c.quantity,(p.status='ON_SALE' AND s.status='ACTIVE') AS available,p.id")+"""
             JOIN shopping_cart c ON c.product_id=p.id WHERE c.user_id=? ORDER BY c.updated_at DESC,p.id DESC
            """,uid(jwt));
    }
    @PostMapping("/cart/{id}") @Transactional
    public Map<String,Object> add(@PathVariable long id,@Valid @RequestBody Quantity in,@AuthenticationPrincipal Jwt jwt) {
        long user=uid(jwt);lockUser(user);
        var old=db.queryForList("SELECT quantity FROM shopping_cart WHERE user_id=? AND product_id=?",Integer.class,user,id);
        int quantity=in.quantity()+(old.isEmpty()?0:old.getFirst());
        if(quantity>99)throw conflict("购物车中该商品最多99件");
        if(old.isEmpty()&&db.queryForObject("SELECT COUNT(*) FROM shopping_cart WHERE user_id=?",Integer.class,user)>=100)throw conflict("购物车最多100种商品，请先清理");
        var p=availableProduct(id);
        if(number(p,"stock")<quantity)throw conflict("库存不足，请调整购买数量");
        db.update("INSERT INTO shopping_cart(user_id,product_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)",user,id,quantity);
        return Map.of("quantity",quantity);
    }
    @PutMapping("/cart/{id}") @Transactional
    public Map<String,Object> quantity(@PathVariable long id,@Valid @RequestBody Quantity in,@AuthenticationPrincipal Jwt jwt) {
        long user=uid(jwt);lockUser(user);
        if(db.queryForList("SELECT product_id FROM shopping_cart WHERE user_id=? AND product_id=?",user,id).isEmpty())throw missing("购物车中没有这件商品");
        var p=availableProduct(id);if(number(p,"stock")<in.quantity())throw conflict("库存不足，请调整购买数量");
        db.update("UPDATE shopping_cart SET quantity=? WHERE user_id=? AND product_id=?",in.quantity(),user,id);
        return Map.of("quantity",in.quantity());
    }
    @DeleteMapping("/cart/{id}") @Transactional
    public Map<String,Boolean> remove(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        lockUser(uid(jwt));db.update("DELETE FROM shopping_cart WHERE user_id=? AND product_id=?",uid(jwt),id);return Map.of("removed",true);
    }
    @GetMapping("/product-favorites")
    public List<Map<String,Object>> favorites(@AuthenticationPrincipal Jwt jwt) {
        return db.queryForList(StoreController.PRODUCT+" JOIN product_favorite f ON f.product_id=p.id WHERE f.user_id=? AND s.status='ACTIVE' ORDER BY f.create_time DESC,p.id DESC LIMIT 200",uid(jwt));
    }
    @PutMapping("/product-favorites/{id}") @Transactional
    public Map<String,Boolean> favorite(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        long user=uid(jwt);lockUser(user);availableProduct(id);
        boolean exists=!db.queryForList("SELECT product_id FROM product_favorite WHERE user_id=? AND product_id=?",user,id).isEmpty();
        if(!exists&&db.queryForObject("SELECT COUNT(*) FROM product_favorite WHERE user_id=?",Integer.class,user)>=200)throw conflict("最多收藏200件好物，请先整理收藏");
        db.update("INSERT IGNORE INTO product_favorite(user_id,product_id) VALUES (?,?)",user,id);return Map.of("favorited",true);
    }
    @DeleteMapping("/product-favorites/{id}")
    public Map<String,Boolean> unfavorite(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        db.update("DELETE FROM product_favorite WHERE user_id=? AND product_id=?",uid(jwt),id);return Map.of("favorited",false);
    }
    @GetMapping("/addresses")
    public List<Map<String,Object>> addresses(@AuthenticationPrincipal Jwt jwt) { return addressList(uid(jwt)); }
    @PostMapping("/addresses") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> addAddress(@Valid @RequestBody AddressInput in,@AuthenticationPrincipal Jwt jwt) {
        long user=uid(jwt);lockUser(user);
        int count=db.queryForObject("SELECT COUNT(*) FROM shipping_address WHERE user_id=?",Integer.class,user);
        if(count>=20)throw conflict("最多保存20个地址");
        boolean primary=in.isDefault()||count==0;
        if(primary)db.update("UPDATE shipping_address SET is_default=false WHERE user_id=?",user);
        long id=insert("INSERT INTO shipping_address(user_id,recipient,phone,region,detail,label,is_default) VALUES (?,?,?,?,?,?,?)",
            user,in.recipient().trim(),in.phone().trim(),in.region().trim(),in.detail().trim(),in.label(),primary);
        return address(id,user);
    }
    @PutMapping("/addresses/{id}") @Transactional
    public Map<String,Object> updateAddress(@PathVariable long id,@Valid @RequestBody AddressInput in,@AuthenticationPrincipal Jwt jwt) {
        long user=uid(jwt);lockUser(user);var old=address(id,user);
        // 保持恰好一个默认地址；要切换默认请在目标地址上设置。
        boolean primary=in.isDefault()||Boolean.TRUE.equals(old.get("isDefault"));
        if(primary)db.update("UPDATE shipping_address SET is_default=false WHERE user_id=?",user);
        db.update("UPDATE shipping_address SET recipient=?,phone=?,region=?,detail=?,label=?,is_default=? WHERE id=? AND user_id=?",
            in.recipient().trim(),in.phone().trim(),in.region().trim(),in.detail().trim(),in.label(),primary,id,user);
        return address(id,user);
    }
    @DeleteMapping("/addresses/{id}") @Transactional
    public Map<String,Boolean> deleteAddress(@PathVariable long id,@AuthenticationPrincipal Jwt jwt) {
        long user=uid(jwt);lockUser(user);var old=address(id,user);
        db.update("DELETE FROM shipping_address WHERE id=? AND user_id=?",id,user);
        if(Boolean.TRUE.equals(old.get("isDefault")))db.update("UPDATE shipping_address SET is_default=true WHERE user_id=? ORDER BY id DESC LIMIT 1",user);
        return Map.of("removed",true);
    }

    /** 按商品编号加锁，所有商品校验成功后才落单；任一失败时整个结算回滚。 */
    @PostMapping("/cart/checkout") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> checkout(@Valid @RequestBody CheckoutInput in,@AuthenticationPrincipal Jwt jwt) {
        long buyer=uid(jwt);lockUser(buyer);
        var lines=in.items().stream().sorted(Comparator.comparingLong(CheckoutLine::productId)).toList();
        if(lines.stream().map(CheckoutLine::productId).distinct().count()!=lines.size())throw conflict("结算商品不能重复");
        String hash=fingerprint(in.addressId(),lines);
        var previous=db.queryForList("SELECT id,payload_hash FROM checkout_batch WHERE buyer_id=? AND request_key=?",buyer,in.requestKey());
        if(!previous.isEmpty()){
            if(!hash.equals(previous.getFirst().get("payload_hash")))throw conflict("结算内容已变化，请重新确认");
            return batch(number(previous.getFirst(),"id"));
        }
        var addr=address(in.addressId(),buyer);
        for(var line:lines) {
            var cart=db.queryForList("SELECT quantity FROM shopping_cart WHERE user_id=? AND product_id=?",Integer.class,buyer,line.productId());
            if(cart.isEmpty()||cart.getFirst()!=line.quantity())throw conflict("购物车已变化，请刷新后重新结算");
            var p=availableProduct(line.productId());
            if(number(p,"stock")<line.quantity())throw conflict("「"+p.get("name")+"」库存不足，请返回购物车调整");
            if(((BigDecimal)p.get("price")).compareTo(line.expectedPrice())!=0)throw conflict("商品价格已变化，请返回购物车确认新价格");
        }
        long batchId=insert("INSERT INTO checkout_batch(buyer_id,request_key,payload_hash) VALUES (?,?,?)",buyer,in.requestKey(),hash);
        for(var line:lines) {
            String request=UUID.randomUUID().toString();
            var order=orders.create(buyer,line.productId(),new OrderController.BuyInput(line.quantity(),(String)addr.get("recipient"),(String)addr.get("phone"),
                addr.get("region")+" "+addr.get("detail"),request,line.expectedPrice()));
            db.update("INSERT INTO checkout_batch_item(batch_id,order_no) VALUES (?,?)",batchId,order.get("orderNo"));
            db.update("DELETE FROM shopping_cart WHERE user_id=? AND product_id=?",buyer,line.productId());
        }
        return batch(batchId);
    }
    private Map<String,Object> batch(long id) {
        var rows=db.queryForList(CommerceOrders.SELECT+" JOIN checkout_batch_item b ON b.order_no=o.order_no WHERE b.batch_id=? ORDER BY o.id",id);
        BigDecimal total=rows.stream().map(o->(BigDecimal)o.get("totalAmount")).reduce(BigDecimal.ZERO,BigDecimal::add);
        return Map.of("batchId",id,"orders",rows,"totalAmount",total);
    }
    private List<Map<String,Object>> addressList(long user) {return db.queryForList("SELECT id,recipient,phone,region,detail,label,is_default AS isDefault FROM shipping_address WHERE user_id=? ORDER BY is_default DESC,id DESC",user);}
    private Map<String,Object> address(long id,long user) {
        return addressList(user).stream().filter(a->number(a,"id")==id).findFirst().orElseThrow(()->missing("收货地址不存在，请重新选择"));
    }
    private Map<String,Object> availableProduct(long id) {
        var rows=db.queryForList("SELECT * FROM shop_product WHERE id=? FOR UPDATE",id);
        if(rows.isEmpty())throw missing("商品不存在");
        var p=rows.getFirst();
        if(!"ON_SALE".equals(p.get("status"))||!"ACTIVE".equals(db.queryForObject("SELECT status FROM shop WHERE id=?",String.class,p.get("shop_id"))))throw conflict("商品已下架或店铺已关闭");
        return p;
    }
    private void lockUser(long id){db.queryForObject("SELECT id FROM `user` WHERE id=? FOR UPDATE",Long.class,id);}
    private long uid(Jwt jwt){return DramaController.userId(jwt);}
    private long number(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
    private String fingerprint(long address,List<CheckoutLine> lines){
        String content=address+"|"+lines.stream().map(l->l.productId()+":"+l.quantity()+":"+l.expectedPrice().stripTrailingZeros().toPlainString()).reduce("",(a,b)->a+"|"+b);
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private long insert(String sql,Object... args){
        var key=new GeneratedKeyHolder();db.update(c->{var ps=c.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<args.length;i++)ps.setObject(i+1,args[i]);return ps;},key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
    private ResponseStatusException conflict(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
    private ResponseStatusException missing(String message){return new ResponseStatusException(HttpStatus.NOT_FOUND,message);}
}
