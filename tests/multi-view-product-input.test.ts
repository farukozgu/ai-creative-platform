import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAddProductImages, isProductImageMimeType, MAX_PROJECT_PRODUCT_IMAGES, nextProductAssetRole } from "../src/lib/assets/product-asset-constraints";
import { resolveActiveProductAssets, type ProductAssetSetRow } from "../src/lib/assets/product-asset-set";
import { compileImageRoleInstructions, orderGenerationImages, orderImageEditImages, orderReferenceReplacementImages } from "../src/lib/generation/image-roles";
import { buildValidationBrief, renderValidationInstructions } from "../src/lib/fidelity-validation/build-validation-brief";
import { resolveCanonicalProductProfile } from "../src/lib/product-understanding/canonical-product-profile";

const image = (id: string) => ({ id, bucketId: "product-assets", objectPath: `${id}.png`, data: Buffer.from(id), mimeType: "image/png" });
const row = (id: string, role: ProductAssetSetRow["product_role"], order: number | null, createdAt: string): ProductAssetSetRow => ({ id, bucket_id: "product-assets", object_path: `${id}.png`, created_at: createdAt, product_profile: null, product_role: role, sort_order: order });

test("product image constraints enforce one to four supported images", () => {
  assert.equal(MAX_PROJECT_PRODUCT_IMAGES, 4); assert.equal(canAddProductImages(3), true); assert.equal(canAddProductImages(4), false); assert.equal(canAddProductImages(2, 3), false);
  assert.equal(nextProductAssetRole(0), "primary"); assert.equal(nextProductAssetRole(1), "supporting"); assert.equal(isProductImageMimeType("image/webp"), true); assert.equal(isProductImageMimeType("image/gif"), false);
});

test("active product set preserves explicit primary/supporting order and caps at four", () => {
  const resolved = resolveActiveProductAssets([row("support-2", "supporting", 2, "2026-01-03"), row("primary", "primary", 0, "2026-01-01"), row("support-1", "supporting", 1, "2026-01-02"), row("support-3", "supporting", 3, "2026-01-04"), row("invalid-fifth", "supporting", 4, "2026-01-05")]);
  assert.deepEqual(resolved.map(({ id }) => id), ["primary", "support-1", "support-2", "support-3"]);
});

test("legacy projects use only the newest single image instead of merging old SKUs", () => {
  const resolved = resolveActiveProductAssets([row("old", null, null, "2026-01-01"), row("new", null, null, "2026-02-01")]);
  assert.deepEqual(resolved.map(({ id, product_role, sort_order }) => [id, product_role, sort_order]), [["new", "primary", 0]]);
});

test("generation ordering keeps product identity views distinct from scene references", () => {
  const products = [image("primary"), image("side"), image("detail")]; const references = [image("scene"), image("style")]; const ordered = orderGenerationImages(products, references);
  assert.deepEqual(ordered.map(({ role }) => role), ["product_identity_source", "product_identity_supporting", "product_identity_supporting", "scene_reference", "style_reference"]);
  assert.match(compileImageRoleInstructions(ordered), /same physical product from different viewpoints/i); assert.match(compileImageRoleInstructions(ordered), /do not generate multiple products/i);
  assert.deepEqual(orderReferenceReplacementImages(references[0]!, products).map(({ role }) => role), ["reference_base_scene", "product_identity_source", "product_identity_supporting", "product_identity_supporting"]);
  assert.deepEqual(orderImageEditImages(image("output"), products).map(({ role }) => role), ["generated_attempt", "product_identity_source", "product_identity_supporting", "product_identity_supporting"]);
});

test("multi-view validation authority covers identity-critical detail", () => {
  const brief = buildValidationBrief({ productProfile: null, vertical: "product", strategy: "rigid_product", sceneSuitability: null, composition: null, creativeCompliance: null, productImageCount: 4 });
  assert.match(brief.sourceAuthority, /same physical product/i); assert.match(brief.sourceAuthority, /hardware.*handles\/straps.*pattern.*branding placement.*construction/i); assert.match(renderValidationInstructions(brief), /collectively form source truth for one single product/i);
});

test("product understanding remains advisory and missing profiles do not block", () => { assert.equal(resolveCanonicalProductProfile([null, { invalid: true }, undefined]), null); });

test("migration and actions enforce limits, reassignment, minimum, and ownership", () => {
  const migration = readFileSync("database/migrations/20261009000000_add_multi_view_product_assets.sql", "utf8"); const actions = readFileSync("src/app/[locale]/dashboard/projects/[projectId]/actions.ts", "utf8");
  assert.match(migration, /at most four active product images/i); assert.match(migration, /product_role = 'primary'/i); assert.match(migration, /must keep at least one product image/i); assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(actions, /getAuthenticatedUserId/); assert.match(actions, /isProductImageMimeType\(uploadedImage\.type\)/); assert.match(actions, /MAX_PRODUCT_IMAGE_FILE_SIZE/);
});

test("generation snapshots product views separately from references and validates all views", () => {
  const source = readFileSync("src/lib/generation/image-worker-service.ts", "utf8");
  assert.match(source, /product_images:[\s\S]*asset_ids:[\s\S]*supporting_asset_ids/); assert.match(source, /references:[\s\S]*referenceGuidance/); assert.match(source, /supportingProducts: usableProductImages/);
});

test("concurrent registration trusts the database-assigned product role", () => {
  const source = readFileSync("src/app/[locale]/dashboard/projects/[projectId]/actions.ts", "utf8");
  assert.match(source, /select\("id, product_role, sort_order"\)/);
  assert.match(source, /if \(asset\.product_role === "primary"\)/);
  assert.match(source, /role: asset\.product_role, sortOrder: asset\.sort_order/);
  assert.doesNotMatch(source, /if \(role === "primary"\)/);
});

test("TR and EN expose multi-view labels, limits, and error states", () => {
  for (const locale of ["tr", "en"]) { const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")); const upload = messages.Dashboard.project.upload; assert.ok(upload.multiViewDescription && upload.multiViewRules && upload.primary && upload.supporting); assert.ok(upload.limitError && upload.minimumError && upload.mutationError); assert.ok(messages.Dashboard.composer.productMultiViewHelper && messages.Dashboard.composer.productLimit); }
});
