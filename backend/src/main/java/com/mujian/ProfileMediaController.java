package com.mujian;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth/profile")
public class ProfileMediaController {
    private final JdbcTemplate db;
    private final Path uploads;

    public ProfileMediaController(JdbcTemplate db, @Value("${app.upload-dir}") String uploadDir) {
        this.db = db;
        this.uploads = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    @PostMapping(path="/{kind}", consumes="multipart/form-data")
    public Map<String,String> upload(@AuthenticationPrincipal Jwt jwt, @PathVariable String kind,
                                     @RequestParam("file") MultipartFile file) throws IOException {
        if (!kind.equals("avatar") && !kind.equals("background"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"只能上传头像或背景图片");
        if (file.isEmpty() || file.getSize() > 5_000_000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择不超过5MB的图片");
        BufferedImage source;
        try (var imageInput = ImageIO.createImageInputStream(file.getInputStream())) {
            if (imageInput == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"图片格式不受支持");
            var readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"图片格式不受支持");
            var reader = readers.next();
            try {
                reader.setInput(imageInput);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || (long)width * height > 36_000_000)
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"图片尺寸过大");
                source = reader.read(0);
            } finally { reader.dispose(); }
        } catch (ResponseStatusException e) { throw e; }
          catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"无法读取这张图片",e); }

        int limit = kind.equals("avatar") ? 512 : 1600;
        double ratio = Math.min(1.0, (double)limit / Math.max(source.getWidth(),source.getHeight()));
        int width = Math.max(1,(int)Math.round(source.getWidth()*ratio));
        int height = Math.max(1,(int)Math.round(source.getHeight()*ratio));
        var output = new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = output.createGraphics();
        try {
            graphics.setColor(new Color(24,24,25));
            graphics.fillRect(0,0,width,height);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.drawImage(source,0,0,width,height,null);
        } finally { graphics.dispose(); }

        Files.createDirectories(uploads);
        String name = UUID.randomUUID()+".jpg";
        Path target = uploads.resolve(name);
        if (!ImageIO.write(output,"jpg",target.toFile()))
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,"图片保存失败");
        long userId = Long.parseLong(jwt.getSubject());
        String column = kind.equals("avatar") ? "avatar_url" : "background_url";
        String old = db.query("SELECT "+column+" FROM user_profile WHERE user_id=?",
            rs -> rs.next() ? rs.getString(1) : null,userId);
        String url = "/uploads/"+name;
        try {
            db.update("INSERT INTO user_profile (user_id,"+column+") VALUES (?,?) ON DUPLICATE KEY UPDATE "+column+"=VALUES("+column+")",
                userId,url);
        } catch (RuntimeException e) {
            Files.deleteIfExists(target);
            throw e;
        }
        if (old != null && old.startsWith("/uploads/"))
            Files.deleteIfExists(uploads.resolve(Path.of(old).getFileName()));
        return Map.of("url",url);
    }
}

@Controller
class ProfileMediaResources implements WebMvcConfigurer {
    private final Path uploads;

    ProfileMediaResources(@Value("${app.upload-dir}") String uploadDir) {
        uploads = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    @Override public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/**").addResourceLocations(uploads.toUri().toString());
    }
}
