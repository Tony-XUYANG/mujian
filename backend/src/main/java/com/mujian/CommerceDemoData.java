package com.mujian;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@org.springframework.core.annotation.Order(40)
public class CommerceDemoData implements CommandLineRunner {
    private final JdbcTemplate db;
    @Value("${app.seed-demo}") boolean seed;
    public CommerceDemoData(JdbcTemplate db) { this.db=db; }
    @Override @org.springframework.transaction.annotation.Transactional
    public void run(String... args) {
        if(!seed)return;
        var owners=db.queryForList("SELECT id FROM `user` WHERE username='admin'",Long.class);
        if(owners.isEmpty()||!db.queryForList("SELECT id FROM shop WHERE owner_id=?",owners.getFirst()).isEmpty())return;
        db.update("INSERT INTO shop(owner_id,name,logo_url,description) VALUES (?,'幕间生活馆','/media/shop-bag.svg','把故事里的温暖，带回日常。演示商品仅用于体验选购流程。')",owners.getFirst());
        long shop=db.queryForObject("SELECT id FROM shop WHERE owner_id=?",Long.class,owners.getFirst());
        String[][] products={{"日落随行帆布袋","bag","39.90","轻装出门，把喜欢的故事装进口袋。棉质帆布，日常通勤好搭配。"},{"奶油色陶瓷马克杯","cup","59.00","给慢下来的片刻，一杯温热的陪伴。简约陶瓷杯，约350毫升。"},{"山间香氛蜡烛","candle","79.00","木质调的安静气息，让观剧时光多一点仪式感。演示商品。"},{"故事随记手帐本","book","29.90","记下打动你的台词，也写下自己的故事。A5留白内页。"}};
        for(var p:products)db.update("INSERT INTO shop_product(shop_id,name,image_url,description,price,stock) VALUES (?,?,?,?,?,50)",shop,p[0],"/media/shop-"+p[1]+".svg",p[3],p[2]);
        var dramas=db.queryForList("SELECT id FROM drama WHERE title='等风，也等你' ORDER BY id LIMIT 1",Long.class);
        if(!dramas.isEmpty()) {
            var ids=db.queryForList("SELECT id FROM shop_product WHERE shop_id=? ORDER BY id",Long.class,shop);
            for(int i=0;i<ids.size();i++)db.update("INSERT IGNORE INTO drama_product(drama_id,product_id,sort_order) VALUES (?,?,?)",dramas.getFirst(),ids.get(i),i);
        }
    }
}
