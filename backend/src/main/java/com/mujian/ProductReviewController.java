package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** 商品评价只允许来自已完成订单的买家，并以订单号保证一次评价。 */
@RestController
@RequestMapping("/api")
public class ProductReviewController {
    private static final String REVIEW_SELECT = """
        SELECT r.id,r.product_id AS productId,r.rating,r.content,
          r.create_time AS createTime,
          u.nickname,COALESCE(up.avatar_url,'') AS avatar
        FROM product_review r
        JOIN `user` u ON u.id=r.buyer_id
        LEFT JOIN user_profile up ON up.user_id=u.id
        """;
    private final JdbcTemplate db;

    public ProductReviewController(JdbcTemplate db) {
        this.db = db;
    }

    public record ReviewInput(
        @Min(value = 1, message = "评分最低为1星") @Max(value = 5, message = "评分最高为5星") int rating,
        @NotBlank(message = "评价内容不能为空") @Size(max = 500, message = "评价最多500字") String content,
        @NotBlank(message = "缺少订单编号") @Pattern(regexp = "[A-Za-z0-9_-]{16,32}", message = "订单编号不正确") String orderNo) {}

    @GetMapping("/mall/products/{productId}/reviews")
    @Transactional(readOnly = true)
    public Map<String, Object> list(@PathVariable long productId) {
        if (db.queryForList("SELECT id FROM shop_product WHERE id=?", productId).isEmpty())
            throw missing("商品不存在");
        var rows = db.queryForList(REVIEW_SELECT +
            " WHERE r.product_id=? AND r.status='VISIBLE' ORDER BY r.create_time DESC,r.id DESC LIMIT 100", productId);
        var summary = db.queryForMap("""
            SELECT COUNT(*) AS reviewCount,COALESCE(ROUND(AVG(rating),1),0) AS averageRating
            FROM product_review WHERE product_id=? AND status='VISIBLE'
            """, productId);
        var result = new HashMap<String, Object>();
        result.put("items", rows);
        result.put("reviewCount", ((Number) summary.get("reviewCount")).longValue());
        result.put("averageRating", summary.get("averageRating"));
        return result;
    }

    @GetMapping("/me/products/{productId}/reviewable-orders")
    public List<Map<String, Object>> reviewable(@PathVariable long productId,
            @AuthenticationPrincipal Jwt jwt) {
        long buyer = DramaController.userId(jwt);
        return db.queryForList("""
            SELECT o.order_no AS orderNo,o.quantity,o.create_time AS createTime
            FROM shop_order o
            LEFT JOIN product_review r ON r.order_no=o.order_no AND r.product_id=o.product_id
            WHERE o.buyer_id=? AND o.product_id=? AND o.status='COMPLETED' AND r.id IS NULL
            ORDER BY o.id DESC LIMIT 20
            """, buyer, productId);
    }

    @PostMapping("/me/products/{productId}/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> create(@PathVariable long productId, @Valid @RequestBody ReviewInput in,
            @AuthenticationPrincipal Jwt jwt) {
        long buyer = DramaController.userId(jwt);
        var orders = db.queryForList("""
            SELECT id,product_id,status FROM shop_order
            WHERE order_no=? AND buyer_id=? FOR UPDATE
            """, in.orderNo(), buyer);
        if (orders.isEmpty() || ((Number) orders.getFirst().get("product_id")).longValue() != productId)
            throw missing("订单不存在或不属于当前商品");
        if (!"COMPLETED".equals(orders.getFirst().get("status")))
            throw conflict("确认收货后才能评价商品");
        // 当前读与订单行锁共同保证并发重试只创建一条评价。
        if (!db.queryForList("SELECT id FROM product_review WHERE order_no=? AND product_id=? FOR UPDATE", in.orderNo(), productId).isEmpty())
            throw conflict("这笔订单已经评价过了");
        db.update("INSERT INTO product_review(product_id,buyer_id,order_no,rating,content) VALUES (?,?,?,?,?)",
            productId, buyer, in.orderNo(), in.rating(), in.content().trim());
        return db.queryForMap(REVIEW_SELECT + " WHERE r.order_no=? AND r.product_id=?", in.orderNo(), productId);
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private ResponseStatusException missing(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
