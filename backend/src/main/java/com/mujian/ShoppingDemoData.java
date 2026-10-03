package com.mujian;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Component
@org.springframework.core.annotation.Order(41)
public class ShoppingDemoData implements CommandLineRunner {
    private final JdbcTemplate db;
    private final ProductDetails details;
    @Value("${app.seed-demo}") boolean seed;
    public ShoppingDemoData(JdbcTemplate db,ProductDetails details){this.db=db;this.details=details;}
    @Override @Transactional public void run(String... args){
        if(!seed)return;
        // 只补充已知示例商品缺失的详情；不改用户填写的信息，不重置价格和库存。
        String[][] samples={
            {"日落随行帆布袋","服饰箱包","棉质帆布","单肩袋 · 约35×40厘米","浙江","杭州","bag"},
            {"奶油色陶瓷马克杯","生活日用","陶瓷","约350毫升 · 单只装","江西","景德镇","cup"},
            {"山间香氛蜡烛","家居香氛","植物蜡","约120克 · 木质调","浙江","杭州","candle"},
            {"故事随记手帐本","文具书籍","纸张","A5 · 留白内页","广东","广州","book"}
        };
        for(var p:samples){
            var ids=db.queryForList("SELECT p.id FROM shop_product p JOIN shop s ON s.id=p.shop_id JOIN `user` u ON u.id=s.owner_id LEFT JOIN shop_product_detail d ON d.product_id=p.id WHERE u.username='admin' AND s.name='幕间生活馆' AND p.name=? AND d.product_id IS NULL",Long.class,p[0]);
            for(long id:ids)details.save(id,new ProductDetails.Input(p[1],p[2],p[3],p[4],p[5],
                "日常里的小小仪式感\n"+p[0]+"，陪伴每一个放松的片刻。\n\n商品参数\n"+p[2]+"；"+p[3]+"。\n\n购买说明\n当前为演示商品，插画和参数用于体验选购，不会实际寄送。请勿将示例参数作为真实商品承诺。",List.of("/media/shop-"+p[6]+".svg")));
        }
    }
}
