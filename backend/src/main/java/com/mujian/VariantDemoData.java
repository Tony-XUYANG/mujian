package com.mujian;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 新增独立示例，不重置旧商品库存或改造用户订单。 */
@Component
@org.springframework.core.annotation.Order(42)
public class VariantDemoData implements CommandLineRunner {
    private final JdbcTemplate db;
    private final ProductDetails details;
    @Value("${app.seed-demo}") boolean seed;
    public VariantDemoData(JdbcTemplate db, ProductDetails details) { this.db=db; this.details=details; }
    @Override @Transactional public void run(String... args) {
        if(!seed)return;
        var shops=db.queryForList("SELECT s.id FROM shop s JOIN `user` u ON u.id=s.owner_id WHERE u.username='admin' AND s.name='幕间生活馆' FOR UPDATE",Long.class);
        if(shops.isEmpty())return;
        long shop=shops.getFirst();
        String name="幕间随行杯 · 多规格演示";
        var existing=db.queryForList("SELECT id FROM shop_product WHERE shop_id=? AND name=?",shop,name);
        long id;
        if(existing.isEmpty()) {
            db.update("INSERT INTO shop_product(shop_id,name,image_url,description,price,stock) VALUES (?,?, '/media/shop-cup.svg','选择喜欢的颜色与容量，体验独立规格价格和库存。演示商品，不会实际寄送。',49,20)",shop,name);
            id=db.queryForObject("SELECT id FROM shop_product WHERE shop_id=? AND name=?",Long.class,shop,name);
            db.update("INSERT INTO product_variant(product_id,name,price,stock) VALUES (?, '奶油白 / 350毫升',49,12),(?, '雾蓝 / 500毫升',59,8),(?, '曜石黑 / 500毫升',69,0)",id,id,id);
        } else id=((Number)existing.getFirst().get("id")).longValue();
        seedMatrix(id);
        details.save(id,new ProductDetails.Input("生活日用","演示材质","颜色与容量可选","演示产地","演示发货地",
            "选择一种款式后即可加购或立即购买。\n同一商品不同规格可同时放入购物车。\n所有图片和参数仅用于功能体验，不构成真实商品承诺。",List.of("/media/shop-cup.svg")));
    }

    private void seedMatrix(long productId) {
        if(db.queryForObject("SELECT COUNT(*) FROM product_attribute WHERE product_id=?",Integer.class,productId)>0)return;
        long color=insert("INSERT INTO product_attribute(product_id,name,sort_order) VALUES (?,?,?)",productId,"颜色",0);
        long capacity=insert("INSERT INTO product_attribute(product_id,name,sort_order) VALUES (?,?,?)",productId,"容量",1);
        long cream=insert("INSERT INTO product_attribute_value(attribute_id,value,sort_order) VALUES (?,?,?)",color,"奶油白",0);
        long blue=insert("INSERT INTO product_attribute_value(attribute_id,value,sort_order) VALUES (?,?,?)",color,"雾蓝",1);
        long black=insert("INSERT INTO product_attribute_value(attribute_id,value,sort_order) VALUES (?,?,?)",color,"曜石黑",2);
        long ml350=insert("INSERT INTO product_attribute_value(attribute_id,value,sort_order) VALUES (?,?,?)",capacity,"350毫升",0);
        long ml500=insert("INSERT INTO product_attribute_value(attribute_id,value,sort_order) VALUES (?,?,?)",capacity,"500毫升",1);
        link(productId,"奶油白 / 350毫升",cream,ml350);
        link(productId,"雾蓝 / 500毫升",blue,ml500);
        link(productId,"曜石黑 / 500毫升",black,ml500);
    }
    private void link(long productId,String name,long... values) {
        var ids=db.queryForList("SELECT id FROM product_variant WHERE product_id=? AND name=?",Long.class,productId,name);
        if(ids.isEmpty())return;
        for(long value:values)db.update("INSERT IGNORE INTO product_variant_value(variant_id,value_id) VALUES (?,?)",ids.getFirst(),value);
    }
    private long insert(String sql,Object... args) {
        var key=new org.springframework.jdbc.support.GeneratedKeyHolder();
        db.update(c->{var ps=c.prepareStatement(sql,java.sql.Statement.RETURN_GENERATED_KEYS);for(int i=0;i<args.length;i++)ps.setObject(i+1,args[i]);return ps;},key);
        return java.util.Objects.requireNonNull(key.getKey()).longValue();
    }
}
