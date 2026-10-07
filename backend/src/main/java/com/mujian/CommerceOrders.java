package com.mujian;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CommerceOrders {
    private final JdbcTemplate db;
    private final ProductVariants variants;
    static final String SELECT = """
        SELECT o.order_no AS orderNo,o.product_id AS productId,o.quantity,o.unit_price AS unitPrice,
          o.total_amount AS totalAmount,o.status,o.create_time AS createTime,o.expires_at AS expiresAt,
          o.product_name AS productName,o.image_url AS imageUrl,o.recipient,o.phone,o.address,
          s.id AS shopId,s.name AS shopName,ov.variant_id AS skuId,ov.variant_name AS variantName,
          EXISTS(SELECT 1 FROM product_review r WHERE r.order_no=o.order_no AND r.product_id=o.product_id) AS reviewed
        FROM shop_order o JOIN shop s ON s.id=o.shop_id
        LEFT JOIN order_variant ov ON ov.order_no=o.order_no
        """;
    public CommerceOrders(JdbcTemplate db,ProductVariants variants) { this.db=db; this.variants=variants; }

    @Transactional
    public Map<String,Object> create(long buyer,long productId,OrderController.BuyInput in) {
        // 锁住买家后检查幂等键，重复请求只返回同一订单，不会重复扣库存。
        db.queryForObject("SELECT id FROM `user` WHERE id=? FOR UPDATE",Long.class,buyer);
        var prior=db.queryForList("SELECT * FROM shop_order WHERE buyer_id=? AND request_key=?",buyer,in.requestKey());
        if(!prior.isEmpty()) {
            var old=prior.getFirst();
            var oldVariants=db.queryForList("SELECT variant_id FROM order_variant WHERE order_no=?",Long.class,old.get("order_no"));
            Long oldSku=oldVariants.isEmpty()?null:oldVariants.getFirst();
            if(number(old,"product_id")!=productId || number(old,"quantity")!=in.quantity()
                || !Objects.equals(oldSku,in.skuId())
                || !in.recipient().trim().equals(old.get("recipient")) || !in.phone().trim().equals(old.get("phone")) || !in.address().trim().equals(old.get("address")))
                throw conflict("这次提交与原订单不同，请重新打开结算页");
            return row((String)old.get("order_no"));
        }
        var products=db.queryForList("SELECT * FROM shop_product WHERE id=? FOR UPDATE",productId);
        if(products.isEmpty())throw missing();
        var p=products.getFirst();
        String shopStatus=db.queryForObject("SELECT status FROM shop WHERE id=?",String.class,p.get("shop_id"));
        if(!"ON_SALE".equals(p.get("status"))||!"ACTIVE".equals(shopStatus))throw conflict("商品已下架或店铺已关闭");
        var choice=variants.choose(p,in.skuId());
        if(choice.stock()<in.quantity())throw conflict("库存不足，请减少购买数量");
        BigDecimal unit=choice.price();
        if(choice.skuId()!=null && in.expectedPrice()==null)throw conflict("请重新确认规格价格");
        if(in.expectedPrice()!=null&&unit.compareTo(in.expectedPrice())!=0)throw conflict("商品价格已变化，请刷新商品页后重新确认");
        String no="MJ"+UUID.randomUUID().toString().replace("-","").substring(0,26).toUpperCase(Locale.ROOT);
        variants.changeStock(productId,choice.skuId(),-in.quantity());
        db.update("""
            INSERT INTO shop_order(order_no,buyer_id,shop_id,product_id,quantity,unit_price,total_amount,
              request_key,product_name,image_url,recipient,phone,address,expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 15 MINUTE))
            """,no,buyer,p.get("shop_id"),productId,in.quantity(),unit,unit.multiply(BigDecimal.valueOf(in.quantity())),
            in.requestKey(),p.get("name"),choice.imageUrl(),in.recipient().trim(),in.phone().trim(),in.address().trim());
        if(choice.skuId()!=null)db.update("INSERT INTO order_variant(order_no,variant_id,variant_name) VALUES (?,?,?)",no,choice.skuId(),choice.name());
        event(no,"PENDING","订单已提交，保留库存15分钟");
        return row(no);
    }
    public List<Map<String,Object>> list(long user,boolean seller) {
        return db.queryForList(SELECT+(seller?" WHERE s.owner_id=?":" WHERE o.buyer_id=?")+" ORDER BY o.id DESC LIMIT 100",user);
    }
    public Map<String,Object> detail(long user,String no,boolean seller) {
        var rows=db.queryForList(SELECT+" WHERE o.order_no=? AND "+(seller?"s.owner_id=?":"o.buyer_id=?"),no,user);
        if(rows.isEmpty())throw missing();
        var result=rows.getFirst();
        result.put("events",db.queryForList("SELECT status,description,created_at AS createTime FROM shop_order_event WHERE order_no=? ORDER BY id",no));
        return result;
    }
    @Transactional
    public Map<String,Object> action(long user,String no,String action) {
        boolean seller=action.equals("ship");
        var rows=db.queryForList("SELECT * FROM shop_order WHERE order_no=? FOR UPDATE",no);
        if(rows.isEmpty())throw missing();
        var o=rows.getFirst();
        long owner=seller?db.queryForObject("SELECT owner_id FROM shop WHERE id=?",Long.class,o.get("shop_id")):number(o,"buyer_id");
        if(owner!=user)throw missing();
        String current=(String)o.get("status");
        if("PENDING".equals(current)&&expired(o)) {
            cancel(o,"未付款超时，库存已释放");
            // 返回取消状态以提交超时返库事务，由客户端显示状态，避免抛异常回滚。
            return row(no);
        }
        String expected=switch(action){case "pay","cancel"->"PENDING";case "ship"->"PAID";case "complete"->"SHIPPED";default->throw conflict("订单操作无效");};
        String target=switch(action){case "pay"->"PAID";case "cancel"->"CANCELLED";case "ship"->"SHIPPED";default->"COMPLETED";};
        if(current.equals(target))return row(no);
        if(!current.equals(expected))throw conflict("订单状态已变化，请刷新后重试");
        if(action.equals("cancel"))cancel(o,"买家取消订单，库存已释放");
        else {
            db.update("UPDATE shop_order SET status=? WHERE id=?",target,o.get("id"));
            event(no,target,switch(action){case "pay"->"模拟支付完成，未发生真实扣款";case "ship"->"店主已标记演示发货，无真实物流";default->"买家已确认收货";});
        }
        return row(no);
    }
    @Transactional
    public void expirePending() {
        var rows=db.queryForList("SELECT * FROM shop_order WHERE status='PENDING' AND expires_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED");
        // 与多商品结算保持商品锁顺序一致。
        rows.sort(Comparator.comparingLong(o->number(o,"product_id")));
        for(var row:rows)cancel(row,"未付款超时，库存已释放");
    }
    private void cancel(Map<String,Object> o,String reason) {
        db.update("UPDATE shop_order SET status='CANCELLED' WHERE id=?",o.get("id"));
        db.queryForObject("SELECT id FROM shop_product WHERE id=? FOR UPDATE",Long.class,o.get("product_id"));
        var selected=db.queryForList("SELECT variant_id FROM order_variant WHERE order_no=?",Long.class,o.get("order_no"));
        variants.changeStock(number(o,"product_id"),selected.isEmpty()?null:selected.getFirst(),(int)number(o,"quantity"));
        event((String)o.get("order_no"),"CANCELLED",reason);
    }
    private void event(String no,String status,String message){db.update("INSERT INTO shop_order_event(order_no,status,description) VALUES (?,?,?)",no,status,message);}
    private boolean expired(Map<String,Object> o) {
        return db.queryForObject("SELECT expires_at<=CURRENT_TIMESTAMP FROM shop_order WHERE id=?",Boolean.class,o.get("id"));
    }
    private Map<String,Object> row(String no) { return db.queryForMap(SELECT+" WHERE o.order_no=?",no); }
    private static long number(Map<String,Object> o,String key) { return ((Number)o.get(key)).longValue(); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"订单或商品不存在"); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
