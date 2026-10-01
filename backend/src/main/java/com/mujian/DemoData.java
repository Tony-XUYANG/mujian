package com.mujian;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@org.springframework.core.annotation.Order(10)
public class DemoData implements CommandLineRunner {
    private final JdbcTemplate db; private final PasswordEncoder passwords;
    @Value("${app.seed-demo}") boolean seed;
    @Value("${app.admin-password}") String adminPassword;
    @Value("${app.demo-password}") String demoPassword;
    public DemoData(JdbcTemplate db,PasswordEncoder passwords){this.db=db;this.passwords=passwords;}
    @Override public void run(String... args) {
        if (!seed) return;
        addUser("admin",adminPassword,"幕间管理员","ADMIN");
        addUser("demo",demoPassword,"追光的人","USER");
        if(db.queryForObject("SELECT COUNT(*) FROM drama",Integer.class)>0) return;
        String[][] items={
            {"长街听风","古装","一封迟到十年的信，让归乡的她重新走进那条长街。风吹过檐下，旧事终于有了回声。","ancient"},
            {"第七封来信","悬疑","每到午夜，门口就出现一封没有署名的信。最后一封信的日期，竟然写着明天。","mystery"},
            {"把日子过成诗","治愈","辞职之后，她在海边开了一家只卖三道菜的小店。故事从一位不愿离开的客人开始。","sea"},
            {"心动发生在日落后","爱情","两位陌生人错过同一班末班车，却意外走进了彼此的人生。城市很大，幸好遇见你。","sunset"},
            {"逆风的她","都市","从实习生到独当一面的设计师，她用一次次不认输，重新定义自己的人生。","city"},
            {"山月不知心底事","古装","故人重逢于山月之下，未说出口的秘密，牵动着一座城的命运。","mountain"},
            {"雨停之前","悬疑","一场暴雨将五个陌生人困在山间旅馆。灯熄灭的那一刻，每个人都开始讲述不同的真相。","rain"},
            {"等风，也等你","爱情","多年后重返故乡，一卷未冲洗的胶片，让两个曾经错过的人再度相遇。","forest"}
        };
        for(var d:items) db.update("INSERT INTO drama(title,category,description,cover_img,video_url) VALUES (?,?,?,?,?)",d[0],d[1],d[2],"/media/"+d[3]+".jpg","/media/sintel-trailer.mp4");
    }
    private void addUser(String username,String password,String nickname,String role) {
        if(db.queryForObject("SELECT COUNT(*) FROM `user` WHERE username=?",Integer.class,username)==0)
            db.update("INSERT INTO `user` (username,password,nickname,role) VALUES (?,?,?,?)",username,passwords.encode(password),nickname,role);
    }
}
