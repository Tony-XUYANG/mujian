package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class OrderController {
    private final CommerceOrders orders;
    public OrderController(CommerceOrders orders) { this.orders=orders; }
    public record BuyInput(
        @Min(value=1,message="至少购买1件") @Max(value=99,message="每单最多99件") int quantity,
        @NotBlank(message="请输入收货人") @Size(max=40,message="收货人最多40字") String recipient,
        @NotBlank(message="请输入联系电话") @Pattern(regexp="[0-9+ ()-]{6,24}",message="请输入有效的联系电话") String phone,
        @NotBlank(message="请输入收货地址") @Size(min=5,max=300,message="收货地址需为5至300字") String address,
        @NotBlank(message="缺少订单请求标识，请重新打开结算页") @Pattern(regexp="[A-Za-z0-9_-]{16,64}",message="订单请求标识不正确") String requestKey,
        @DecimalMin(value="0.01",message="价格不正确") @Digits(integer=8,fraction=2,message="价格最多两位小数") BigDecimal expectedPrice,
        @Positive(message="规格编号不正确") Long skuId) {}
    @PostMapping("/products/{id}/buy") @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> buy(@PathVariable long id,@Valid @RequestBody BuyInput in,@AuthenticationPrincipal Jwt jwt) { return orders.create(DramaController.userId(jwt),id,in); }
    @GetMapping("/me/orders")
    public List<Map<String,Object>> mine(@AuthenticationPrincipal Jwt jwt) { return orders.list(DramaController.userId(jwt),false); }
    @GetMapping("/shop/orders")
    public List<Map<String,Object>> seller(@AuthenticationPrincipal Jwt jwt) { return orders.list(DramaController.userId(jwt),true); }
    @GetMapping("/me/orders/{no}")
    public Map<String,Object> detail(@PathVariable String no,@AuthenticationPrincipal Jwt jwt){return orders.detail(DramaController.userId(jwt),no,false);}
    @GetMapping("/shop/orders/{no}")
    public Map<String,Object> sellerDetail(@PathVariable String no,@AuthenticationPrincipal Jwt jwt){return orders.detail(DramaController.userId(jwt),no,true);}
    @PostMapping("/me/orders/{no}/demo-pay")
    public Map<String,Object> pay(@PathVariable String no,@AuthenticationPrincipal Jwt jwt) { return orders.action(DramaController.userId(jwt),no,"pay"); }
    @PostMapping("/me/orders/{no}/cancel")
    public Map<String,Object> cancel(@PathVariable String no,@AuthenticationPrincipal Jwt jwt) { return orders.action(DramaController.userId(jwt),no,"cancel"); }
    @PostMapping("/me/orders/{no}/complete")
    public Map<String,Object> complete(@PathVariable String no,@AuthenticationPrincipal Jwt jwt) { return orders.action(DramaController.userId(jwt),no,"complete"); }
    @PostMapping("/shop/orders/{no}/ship")
    public Map<String,Object> ship(@PathVariable String no,@AuthenticationPrincipal Jwt jwt) { return orders.action(DramaController.userId(jwt),no,"ship"); }
    @Scheduled(fixedDelay=30000,initialDelay=10000)
    public void expire() { orders.expirePending(); }
}
