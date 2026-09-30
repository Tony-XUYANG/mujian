package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final JdbcTemplate db;
    private final PasswordEncoder passwords;
    private final JwtEncoder tokens;
    public AuthController(JdbcTemplate db, PasswordEncoder passwords, JwtEncoder tokens) {
        this.db = db; this.passwords = passwords; this.tokens = tokens;
    }
    public record Login(@NotBlank(message="请输入用户名") String username, @NotBlank(message="请输入密码") String password) {}
    public record Register(
        @NotBlank(message="请输入用户名")
        @Pattern(regexp="[\\p{IsHan}A-Za-z0-9_]{2,24}", message="用户名需为2–24位中文、字母、数字或下划线") String username,
        @Size(min=8,max=64,message="密码长度需为8–64位") @NotNull String password,
        @NotBlank(message="请输入昵称") @Size(max=30,message="昵称最多30字") String nickname) {}

    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> register(@Valid @RequestBody Register input) {
        if (input.password().getBytes(StandardCharsets.UTF_8).length > 72)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"密码的UTF-8长度不能超过72字节");
        try {
            db.update("INSERT INTO `user` (username,password,nickname,role) VALUES (?,?,?,'USER')",
                input.username(),passwords.encode(input.password()),input.nickname().trim());
        } catch (DuplicateKeyException e) { throw new ResponseStatusException(HttpStatus.CONFLICT,"该用户名已被使用"); }
        return session(find(input.username()));
    }
    @PostMapping("/login")
    public Map<String,Object> login(@Valid @RequestBody Login input) {
        var rows = db.queryForList("SELECT * FROM `user` WHERE username=?", input.username().trim());
        if (rows.isEmpty() || input.password().getBytes(StandardCharsets.UTF_8).length > 72 ||
            !passwords.matches(input.password(), (String)rows.getFirst().get("password")))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"用户名或密码错误");
        return session(find(input.username().trim()));
    }
    @GetMapping("/me")
    public Map<String,Object> me(@AuthenticationPrincipal Jwt jwt) {
        var rows = db.queryForList("""
            SELECT u.id,u.username,u.nickname,u.role,p.avatar_url AS avatarUrl,p.background_url AS backgroundUrl
            FROM `user` u LEFT JOIN user_profile p ON p.user_id=u.id WHERE u.id=?
            """, jwt.getSubject());
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"账号不存在，请重新登录");
        return rows.getFirst();
    }
    public record ProfileInput(
        @NotBlank(message="请输入昵称") @Size(max=30,message="昵称最多30字") String nickname) {}

    @PatchMapping("/profile")
    public Map<String,Object> updateProfile(@Valid @RequestBody ProfileInput input,
                                           @AuthenticationPrincipal Jwt jwt) {
        String nickname = input.nickname().strip();
        if (nickname.isBlank() || nickname.codePoints().anyMatch(Character::isISOControl))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"昵称不能为空或包含换行、控制字符");
        // Identity comes only from the authenticated session; account and role cannot be edited here.
        if (db.update("UPDATE `user` SET nickname=? WHERE id=?",nickname,jwt.getSubject()) == 0)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"账号不存在，请重新登录");
        return me(jwt);
    }
    private Map<String,Object> find(String username) {
        return db.queryForMap("""
            SELECT u.id,u.username,u.nickname,u.role,p.avatar_url AS avatarUrl,p.background_url AS backgroundUrl
            FROM `user` u LEFT JOIN user_profile p ON p.user_id=u.id WHERE u.username=?
            """,username);
    }
    private Map<String,Object> session(Map<String,Object> user) {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().issuer("mujian").subject(user.get("id").toString())
            .issuedAt(now).expiresAt(now.plusSeconds(8*3600)).claim("role",user.get("role")).build();
        String token = tokens.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
        var profile = new HashMap<String,Object>();
        for (var key : new String[]{"id","username","nickname","role","avatarUrl","backgroundUrl"})
            profile.put(key,user.get(key));
        return Map.of("token",token,"user",profile);
    }
}
