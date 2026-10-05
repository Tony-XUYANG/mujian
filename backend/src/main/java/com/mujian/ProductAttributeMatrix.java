package com.mujian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.sql.Statement;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * 独立属性矩阵（颜色、容量等）。组合规格仍然使用 product_variant，
 * 因此旧商品、购物车和订单不需要迁移；没有属性映射的旧规格仍可继续购买。
 */
@RestController
@RequestMapping("/api/shop/products")
public class ProductAttributeMatrix {
    private final JdbcTemplate db;
    private final ProductVariants variants;

    public ProductAttributeMatrix(JdbcTemplate db, ProductVariants variants) {
        this.db = db;
        this.variants = variants;
    }

    public record ValueInput(
        @Positive(message="属性值编号不正确") Long id,
        @NotBlank(message="请输入属性值") @Size(max=60,message="属性值最多60字") String value) {}

    public record AttributeInput(
        @Positive(message="属性组编号不正确") Long id,
        @NotBlank(message="请输入属性组名称") @Size(max=40,message="属性组名称最多40字") String name,
        @NotEmpty(message="每个属性组至少保留一个属性值") @Size(max=10,message="每个属性组最多10个属性值")
        List<@NotNull @Valid ValueInput> values) {}

    public record MatrixVariantInput(
        @Positive(message="组合规格编号不正确") Long id,
        @NotEmpty(message="请选择完整属性组合") @Size(max=3,message="属性组合最多3组") List<@NotNull Long> valueIds,
        @NotNull(message="请输入组合价格") @DecimalMin(value="0.01",message="组合价格需大于0")
        @Digits(integer=8,fraction=2,message="组合价格最多两位小数") BigDecimal price,
        @NotNull(message="请输入组合库存") @Min(value=0,message="组合库存不能为负数") @Max(value=999999,message="组合库存不能超过999999") Integer stock,
        boolean onSale) {}

    public record SaveInput(
        @NotNull(message="请刷新属性矩阵后再保存") @PositiveOrZero(message="版本不正确") Long version,
        @NotEmpty(message="至少设置一个属性组") @Size(max=3,message="最多设置3个属性组") List<@NotNull @Valid AttributeInput> groups,
        @NotEmpty(message="至少生成一个组合规格") @Size(max=20,message="最多生成20个组合规格") List<@NotNull @Valid MatrixVariantInput> variants) {}

    @GetMapping("/{id}/attributes")
    public Map<String, Object> read(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        var product = owned(id, DramaController.userId(jwt), false);
        return Map.of(
            "version", product.get("version"),
            "groups", groups(id),
            "variants", matrixVariants(id),
            "limits", Map.of("maxGroups", 3, "maxValuesPerGroup", 10, "maxCombinations", 20));
    }

    /** Read-only projection used by the public product detail endpoint. */
    public List<Map<String, Object>> publicGroups(long productId) { return groups(productId); }
    public List<Map<String, Object>> publicVariants(long productId) { return matrixVariants(productId); }

    @PutMapping("/{id}/attributes")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String, Object> save(@PathVariable long id, @Valid @RequestBody SaveInput in,
                                    @AuthenticationPrincipal Jwt jwt) {
        var product = owned(id, DramaController.userId(jwt), true);
        if (number(product, "version") != in.version())
            throw conflict("商品或库存已变化，请关闭属性矩阵窗口并刷新后重试");

        var oldGroups = db.queryForList("SELECT id, name FROM product_attribute WHERE product_id=? ORDER BY sort_order,id", id);
        var oldGroupIds = ids(oldGroups, "id");
        var suppliedGroupIds = new HashSet<Long>();
        var groupNames = new HashSet<String>();
        var oldValues = db.queryForList("""
            SELECT v.id,v.attribute_id AS attributeId,v.value
            FROM product_attribute_value v JOIN product_attribute a ON a.id=v.attribute_id
            WHERE a.product_id=? ORDER BY a.sort_order,a.id,v.sort_order,v.id
            """, id);
        var oldValueIds = ids(oldValues, "id");
        var suppliedValueIds = new HashSet<Long>();
        var groupIds = new ArrayList<Long>();
        var groupValueIds = new ArrayList<List<Long>>();

        for (int gi = 0; gi < in.groups().size(); gi++) {
            var group = in.groups().get(gi);
            String groupName = group.name().strip();
            if (!groupNames.add(groupName.toLowerCase(Locale.ROOT))) throw bad("属性组名称不能重复");
            long groupId;
            if (group.id() == null) {
                groupId = insert("INSERT INTO product_attribute(product_id,name,sort_order) VALUES (?,?,?)", id, groupName, gi);
            } else {
                if (!oldGroupIds.contains(group.id()) || !suppliedGroupIds.add(group.id()))
                    throw bad("属性组不属于当前商品或重复提交");
                groupId = group.id();
                db.update("UPDATE product_attribute SET name=?,sort_order=? WHERE id=? AND product_id=?", groupName, gi, groupId, id);
            }
            groupIds.add(groupId);
            var values = new ArrayList<Long>();
            var valueNames = new HashSet<String>();
            for (int vi = 0; vi < group.values().size(); vi++) {
                var value = group.values().get(vi);
                String valueName = value.value().strip();
                if (!valueNames.add(valueName.toLowerCase(Locale.ROOT))) throw bad("同一属性组内的属性值不能重复");
                long valueId;
                if (value.id() == null) {
                    valueId = insert("INSERT INTO product_attribute_value(attribute_id,value,sort_order) VALUES (?,?,?)", groupId, valueName, vi);
                } else {
                    var belongs = db.queryForList("SELECT id FROM product_attribute_value WHERE id=? AND attribute_id=?", value.id(), groupId);
                    if (belongs.isEmpty() || !suppliedValueIds.add(value.id())) throw bad("属性值不属于当前属性组或重复提交");
                    valueId = value.id();
                    db.update("UPDATE product_attribute_value SET value=?,sort_order=? WHERE id=? AND attribute_id=?", valueName, vi, valueId, groupId);
                }
                values.add(valueId);
            }
            groupValueIds.add(values);
        }
        if (!suppliedGroupIds.equals(oldGroupIds)) throw bad("已有属性组不能删除，请先停用相关组合");
        if (!suppliedValueIds.equals(oldValueIds)) throw bad("已有属性值不能删除，请先停用相关组合");

        var valueToGroup = new HashMap<Long, Long>();
        for (int i = 0; i < groupIds.size(); i++) for (long valueId : groupValueIds.get(i)) valueToGroup.put(valueId, groupIds.get(i));
        var oldVariants = variants.list(id, true);
        var oldVariantIds = ids(oldVariants, "id");
        var mappedOldIds = new HashSet<Long>(db.queryForList("""
            SELECT DISTINCT vv.variant_id FROM product_variant_value vv
            JOIN product_attribute_value av ON av.id=vv.value_id
            JOIN product_attribute a ON a.id=av.attribute_id
            WHERE a.product_id=?
            """, Long.class, id));
        var suppliedVariantIds = new HashSet<Long>();
        var combinationKeys = new HashSet<String>();
        var combinationNames = new HashSet<String>();
        var legacyNames = new HashSet<String>();
        var resolvedCombinations = new IdentityHashMap<MatrixVariantInput, List<Long>>();
        oldVariants.stream().filter(v -> !mappedOldIds.contains(number(v, "id"))).forEach(v -> legacyNames.add(((String) v.get("name")).strip().toLowerCase(Locale.ROOT)));
        int newCount = 0;
        for (var item : in.variants()) {
            if (item.id() != null) {
                if (!oldVariantIds.contains(item.id()) || !suppliedVariantIds.add(item.id())) throw bad("组合规格不属于当前商品或重复提交");
            } else newCount++;
            if (item.valueIds().size() != groupIds.size())
                throw bad("每个组合必须为每个属性组选择一个不同的属性值");
            var seenGroups = new HashSet<Long>();
            var names = new ArrayList<String>();
            var resolved = new ArrayList<Long>();
            for (int gi = 0; gi < item.valueIds().size(); gi++) {
                long rawValueId = item.valueIds().get(gi);
                long valueId = rawValueId > 0 ? rawValueId : temporaryValue(groupValueIds, gi, rawValueId);
                resolved.add(valueId);
                Long groupId = valueToGroup.get(valueId);
                if (groupId == null || !seenGroups.add(groupId)) throw bad("组合包含无效或重复属性值");
                names.add((String) db.queryForObject("SELECT value FROM product_attribute_value WHERE id=?", String.class, valueId));
            }
            if (resolved.size() != new HashSet<>(resolved).size()) throw bad("每个组合必须为每个属性组选择一个不同的属性值");
            resolvedCombinations.put(item, resolved);
            String key = resolved.stream().sorted().map(String::valueOf).reduce("", (a, b) -> a + "," + b);
            if (!combinationKeys.add(key)) throw bad("组合规格不能重复");
            String name = String.join(" / ", names);
            if (!combinationNames.add(name.toLowerCase(Locale.ROOT)) || legacyNames.contains(name.toLowerCase(Locale.ROOT)))
                throw bad("组合名称与已有规格重复");
            if (name.length() > 80) throw bad("组合名称过长，请缩短属性值");
        }
        if (!suppliedVariantIds.containsAll(mappedOldIds)) throw bad("已有组合不能删除，请将其设为停售");
        if (oldVariants.size() + newCount > 20) throw bad("商品最多保留20种规格");
        long total = in.variants().stream().mapToLong(v -> v.stock()).sum();
        total += oldVariants.stream().filter(v -> !suppliedVariantIds.contains(number(v, "id"))).mapToLong(v -> number(v, "stock")).sum();
        if (total > 999999) throw bad("全部规格库存合计不能超过999999");

        for (var item : in.variants()) {
            var resolved = resolvedCombinations.get(item);
            String name = resolved.stream().map(valueId -> db.queryForObject("SELECT value FROM product_attribute_value WHERE id=?", String.class, valueId)).reduce((a, b) -> a + " / " + b).orElseThrow();
            long variantId = item.id() == null
                ? insert("INSERT INTO product_variant(product_id,name,price,stock,on_sale) VALUES (?,?,?,?,?)", id, name, item.price(), item.stock(), item.onSale())
                : item.id();
            if (item.id() != null) db.update("UPDATE product_variant SET name=?,price=?,stock=?,on_sale=? WHERE id=? AND product_id=?", name, item.price(), item.stock(), item.onSale(), variantId, id);
            db.update("DELETE FROM product_variant_value WHERE variant_id=?", variantId);
            for (long valueId : resolved) db.update("INSERT INTO product_variant_value(variant_id,value_id) VALUES (?,?)", variantId, valueId);
        }
        variants.syncProduct(id);
        return read(id, jwt);
    }

    private List<Map<String, Object>> groups(long productId) {
        var rows = db.queryForList("SELECT id,name,sort_order AS sortOrder FROM product_attribute WHERE product_id=? ORDER BY sort_order,id", productId);
        for (var row : rows) row.put("values", db.queryForList("SELECT id,attribute_id AS attributeId,value,sort_order AS sortOrder FROM product_attribute_value WHERE attribute_id=? ORDER BY sort_order,id", row.get("id")));
        return rows;
    }

    private List<Map<String, Object>> matrixVariants(long productId) {
        var rows = variants.list(productId, false);
        for (var row : rows) row.put("valueIds", db.queryForList("SELECT vv.value_id FROM product_variant_value vv JOIN product_attribute_value av ON av.id=vv.value_id JOIN product_attribute a ON a.id=av.attribute_id WHERE vv.variant_id=? AND a.product_id=? ORDER BY a.sort_order,av.sort_order,av.id", Long.class, row.get("id"), productId));
        return rows;
    }

    private Map<String, Object> owned(long id, long owner, boolean lock) {
        var rows = db.queryForList("SELECT * FROM shop_product WHERE id=?" + (lock ? " FOR UPDATE" : ""), id);
        if (rows.isEmpty() || db.queryForObject("SELECT COUNT(*) FROM shop WHERE id=? AND owner_id=? AND status='ACTIVE'", Integer.class, rows.getFirst().get("shop_id"), owner) == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "商品不存在或不属于当前店铺");
        return rows.getFirst();
    }

    private long insert(String sql, Object... args) {
        var key = new GeneratedKeyHolder();
        db.update(c -> {
            var ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            return ps;
        }, key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
    private static Set<Long> ids(List<Map<String, Object>> rows, String key) { var result = new HashSet<Long>(); rows.forEach(r -> result.add(number(r, key))); return result; }
    private static long temporaryValue(List<List<Long>> groupValueIds, int groupIndex, long rawValueId) {
        if (rawValueId >= 0) throw bad("属性值编号不正确");
        long valueIndex = -rawValueId - 1;
        if (valueIndex < 0 || valueIndex >= groupValueIds.get(groupIndex).size()) throw bad("属性组合中的属性值不存在");
        return groupValueIds.get(groupIndex).get((int) valueIndex);
    }
    private static long number(Map<String, Object> row, String key) { return ((Number) row.get(key)).longValue(); }
    private static ResponseStatusException conflict(String text) { return new ResponseStatusException(HttpStatus.CONFLICT, text); }
    private static ResponseStatusException bad(String text) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, text); }
}
