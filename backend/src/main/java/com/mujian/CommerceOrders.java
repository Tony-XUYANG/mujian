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
    static final String SELECT = """
        SELECT o.order_no AS orderNo,o.product_id AS productId,o.quantity,o.unit_price AS unitPrice,
          o.total_amount AS totalAmount,o.status,o.create_time AS createTime,o.expires_at AS expiresAt,
          o.product_name AS productName,o.image_url AS imageUrl,o.recipient,o.phone,o.address,
          s.id AS shopId,s.name AS shopName
        FROM shop_order o JOIN shop s ON s.id=o.shop_id
        """;
    public CommerceOrders(JdbcTemplate db) { this.db=db; }

    @Transactional
    public Map<String,Object> create(long buyer,long productId,OrderController.BuyInput in) {
        // 锁住买家后检查幂等键，重复请求只返回同一订单，不会重复扣库存。
        db.queryForObject("SELECT id FROM `user` WHERE id=? FOR UPDATE",Long.class,buyer);
        var prior=db.queryForList("SELECT * FROM shop_order WHERE buyer_id=? AND request_key=?",buyer,in.requestKey());
        if(!prior.isEmpty()) {
            var old=prior.getFirst();
            if(number(old,"product_id")!=productId || number(old,"quantity")!=in.quantity()
                || !in.recipient().trim().equals(old.get("recipient")) || !in.phone().trim().equals(old.get("phone")) || !in.address().trim().equals(old.get("address")))
                throw conflict("这次提交与原订单不同，请重新打开结算页");
            return row((String)old.get("order_no"));
        }
        var products=db.queryForList("SELECT * FROM shop_product WHERE id=? FOR UPDATE",productId);
        if(products.isEmpty())throw missing();
        var p=products.getFirst();
        String shopStatus=db.queryForObject("SELECT status FROM shop WHERE id=?",String.class,p.get("shop_id"));
        if(!"ON_SALE".equals(p.get("status"))||!"ACTIVE".equals(shopStatus))throw conflict("商品已下架或店铺已关闭");
        if(number(p,"stock")<in.quantity())throw conflict("库存不足，请减少购买数量");
        BigDecimal unit=(BigDecimal)p.get("price");
        String no="MJ"+UUID.randomUUID().toString().replace("-","").substring(0,26).toUpperCase(Locale.ROOT);
        db.update("UPDATE shop_product SET stock=stock-?,version=version+1 WHERE id=?",in.quantity(),productId);
        db.update("""
            INSERT INTO shop_order(order_no,buyer_id,shop_id,product_id,quantity,unit_price,total_amount,
              request_key,product_name,image_url,recipient,phone,address,expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 15 MINUTE))
            """,no,buyer,p.get("shop_id"),productId,in.quantity(),unit,unit.multiply(BigDecimal.valueOf(in.quantity())),
            in.requestKey(),p.get("name"),p.get("image_url"),in.recipient().trim(),in.phone().trim(),in.address().trim());
        return row(no);
    }
    public List<Map<String,Object>> list(long user,boolean seller) {
        return db.queryForList(SELECT+(seller?" WHERE s.owner_id=?":" WHERE o.buyer_id=?")+" ORDER BY o.id DESC LIMIT 100",user);
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
            cancel(o);
            // 返回取消状态以提交超时返库事务，由客户端显示状态，避免抛异常回滚。
            return row(no);
        }
        String expected=switch(action){case "pay","cancel"->"PENDING";case "ship"->"PAID";case "complete"->"SHIPPED";default->throw conflict("订单操作无效");};
        String target=switch(action){case "pay"->"PAID";case "cancel"->"CANCELLED";case "ship"->"SHIPPED";default->"COMPLETED";};
        if(current.equals(target))return row(no);
        if(!current.equals(expected))throw conflict("订单状态已变化，请刷新后重试");
        if(action.equals("cancel"))cancel(o);
        else db.update("UPDATE shop_order SET status=? WHERE id=?",target,o.get("id"));
        return row(no);
    }
    @Transactional
    public void expirePending() {
        var rows=db.queryForList("SELECT * FROM shop_order WHERE status='PENDING' AND expires_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED");
        for(var row:rows)cancel(row);
    }
    private void cancel(Map<String,Object> o) {
        db.update("UPDATE shop_order SET status='CANCELLED' WHERE id=?",o.get("id"));
        db.update("UPDATE shop_product SET stock=stock+?,version=version+1 WHERE id=?",o.get("quantity"),o.get("product_id"));
    }
    private boolean expired(Map<String,Object> o) {
        return db.queryForObject("SELECT expires_at<=CURRENT_TIMESTAMP FROM shop_order WHERE id=?",Boolean.class,o.get("id"));
    }
    private Map<String,Object> row(String no) { return db.queryForMap(SELECT+" WHERE o.order_no=?",no); }
    private static long number(Map<String,Object> o,String key) { return ((Number)o.get(key)).longValue(); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"订单或商品不存在"); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
