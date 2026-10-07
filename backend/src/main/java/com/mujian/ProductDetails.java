package com.mujian;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductDetails {
    public static final List<String> CATEGORIES=List.of("生活日用","家居香氛","服饰箱包","文具书籍","数码配件","其他好物");
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final ShopMedia media;
    public ProductDetails(JdbcTemplate db,ObjectMapper json,ShopMedia media){this.db=db;this.json=json;this.media=media;}
    public record Input(
        @NotBlank(message="请选择商品分类") String category,
        @Size(max=100,message="材质最多100字") String material,
        @Size(max=100,message="规格最多100字") String specification,
        @Size(max=80,message="产地最多80字") String origin,
        @Size(max=80,message="发货地最多80字") String shippingFrom,
        @Size(max=4000,message="详情最多4000字") String detailText,
        @Size(max=6,message="商品相册最多6张") List<@NotBlank(message="图片地址不能为空") @Size(max=1000,message="图片地址过长") String> images) {}
    public void save(long id,Input in) {
        if(in==null)return; // 兼容旧客户端，省略扩展信息时保留已有资料。
        if(!CATEGORIES.contains(in.category()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择有效商品分类");
        var images=in.images()==null?List.<String>of():in.images().stream().map(String::trim).distinct().toList();
        images.forEach(image -> media.validateForProduct(id,image));
        try {
            db.update("""
                INSERT INTO shop_product_detail(product_id,category,material,specification,origin,shipping_from,detail_text,image_urls)
                VALUES (?,?,?,?,?,?,?,CAST(? AS JSON))
                ON DUPLICATE KEY UPDATE category=VALUES(category),material=VALUES(material),specification=VALUES(specification),
                  origin=VALUES(origin),shipping_from=VALUES(shipping_from),detail_text=VALUES(detail_text),image_urls=VALUES(image_urls)
                """,id,in.category(),clean(in.material()),clean(in.specification()),clean(in.origin()),clean(in.shippingFrom()),clean(in.detailText()),json.writeValueAsString(images));
        } catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
    }
    private String clean(String s){return s==null?"":s.trim();}
}
