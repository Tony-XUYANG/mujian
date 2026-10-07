package com.mujian;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Immutable merchant images: replacing a product picture never removes order images. */
@RestController
@RequestMapping("/api/shop/media")
public class ShopMedia {
    private final JdbcTemplate db;
    private final Path directory;
    public ShopMedia(JdbcTemplate db, @Value("${app.upload-dir}") String uploads) {
        this.db = db;
        directory = Path.of(uploads).toAbsolutePath().normalize().resolve("shop");
    }

    @PostMapping(path="/images", consumes="multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional(rollbackFor=Exception.class)
    public Map<String,Object> upload(@AuthenticationPrincipal Jwt jwt, @RequestParam("file") MultipartFile file) throws IOException {
        // The shop lock serializes quota checks, including concurrent uploads.
        var shops = db.queryForList("SELECT id FROM shop WHERE owner_id=? AND status='ACTIVE' FOR UPDATE", DramaController.userId(jwt));
        if (shops.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"请先开通店铺，再上传商品图片");
        long shopId = ((Number)shops.getFirst().get("id")).longValue();
        if (db.queryForObject("SELECT COUNT(*) FROM shop_media WHERE shop_id=?", Long.class, shopId) >= 500)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"店铺图片已达500张，请联系管理员整理素材");
        if (db.queryForObject("SELECT COUNT(*) FROM shop_media WHERE shop_id=? AND create_time>DATE_SUB(NOW(),INTERVAL 1 HOUR)", Long.class, shopId) >= 60)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"上传较频繁，请一小时后再试");
        if (file.isEmpty() || file.getSize()>5_000_000) throw bad("请选择不超过5MB的图片");

        BufferedImage source;
        try (var stream = file.getInputStream(); var input = ImageIO.createImageInputStream(stream)) {
            if (input==null) throw bad("图片格式不受支持，请选择JPG或PNG图片");
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw bad("图片格式不受支持，请选择JPG或PNG图片");
            var reader = readers.next();
            try {
                if (!Set.of("jpeg","png").contains(reader.getFormatName().toLowerCase(Locale.ROOT)))
                    throw bad("图片格式不受支持，请选择JPG或PNG图片");
                reader.setInput(input);
                int width=reader.getWidth(0), height=reader.getHeight(0);
                if (width<1 || height<1 || width>12000 || height>12000 || (long)width*height>16_000_000)
                    throw bad("图片尺寸过大，请选择不超过1600万像素的图片");
                source=reader.read(0);
            } finally { reader.dispose(); }
        } catch (ResponseStatusException ex) { throw ex; }
          catch (Exception ex) { throw bad("无法读取这张图片，请重新选择"); }
        double ratio=Math.min(1.0,1024.0/Math.max(source.getWidth(),source.getHeight()));
        int width=Math.max(1,(int)Math.round(source.getWidth()*ratio)), height=Math.max(1,(int)Math.round(source.getHeight()*ratio));
        var output=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);
        var graphics=output.createGraphics();
        try {
            graphics.setColor(Color.WHITE); graphics.fillRect(0,0,width,height);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.drawImage(source,0,0,width,height,null);
        } finally { graphics.dispose(); source.flush(); }
        Files.createDirectories(directory);
        String url="/uploads/shop/"+UUID.randomUUID()+".jpg";
        Path target=directory.resolve(url.substring(url.lastIndexOf('/')+1));
        // No original filename or metadata is retained; generated URLs are never overwritten.
        boolean created=false;
        try (var stream=Files.newOutputStream(target,StandardOpenOption.CREATE_NEW)) {
            created=true;
            if (!ImageIO.write(output,"jpg",stream)) throw new IOException("JPEG writer unavailable");
        } catch (Exception ex) { if (created) Files.deleteIfExists(target); throw ex; }
        finally { output.flush(); }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status!=STATUS_COMMITTED) try { Files.deleteIfExists(target); }
                catch (IOException ex) { org.slf4j.LoggerFactory.getLogger(ShopMedia.class).warn("Image rollback cleanup failed",ex); }
            }
        });
        long bytes=Files.size(target);
        db.update("INSERT INTO shop_media(shop_id,url,byte_size,width,height) VALUES (?,?,?,?,?)",shopId,url,bytes,width,height);
        return Map.of("url",url,"width",width,"height",height,"bytes",bytes);
    }

    public void validateForProduct(long productId,String value) {
        long shopId=db.queryForObject("SELECT shop_id FROM shop_product WHERE id=?",Long.class,productId);
        validate(shopId,value);
    }
    public void validate(long shopId,String value) {
        if (value==null || value.isBlank()) return;
        String url=value.strip();
        String path;
        try { path=URI.create(url).getPath(); } catch (IllegalArgumentException ex) { throw bad("图片地址格式不正确"); }
        if (path!=null && path.startsWith("/uploads/")) {
            if (!url.matches("/uploads/shop/[0-9a-f-]{36}\\.jpg")) throw bad("请选择本店上传的商品图片");
            if (db.queryForObject("SELECT COUNT(*) FROM shop_media WHERE shop_id=? AND url=?",Integer.class,shopId,url)==0)
                throw bad("这张上传图片不存在或不属于当前店铺");
        } else AdminController.validateUrl(url);
    }
    private static ResponseStatusException bad(String text) {return new ResponseStatusException(HttpStatus.BAD_REQUEST,text);}
}
