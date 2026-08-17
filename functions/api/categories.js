import { getUser, isStaff, canManageAll, json } from "./_auth.js";

export async function onRequest({ request, env }) {
  try {
    const method = request.method;
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    // GET — public categories
    if (method === "GET") {
      const result = await env.DB.prepare(`
        SELECT
          c.*,
          p.name AS parent_name,
          p.slug AS parent_slug
        FROM categories c
        LEFT JOIN categories p
          ON p.id = c.parent_id
        WHERE c.status = 'active'
        ORDER BY
          COALESCE(c.parent_id, 0),
          c.menu_order,
          c.name
      `).all();

      return json({
        success: true,
        categories: result.results || []
      });
    }

    // Authentication
    const user = await getUser(request, env);

    if (!user || !isStaff(user)) {
      return json({
        success: false,
        error: "Unauthorized"
      }, 401);
    }

    // CREATE / UPDATE
    if (method === "POST" || method === "PUT") {

      const body = await request.json();

      const name = String(body.name || "").trim();

      const slug = String(
        body.slug || ""
      ).trim().toLowerCase();

      const parentId = body.parent_id
        ? Number(body.parent_id)
        : null;

      if (!name) {
        return json({
          success: false,
          error: "Category name जरूरी अछि।"
        }, 400);
      }

      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ) {
        return json({
          success: false,
          error: "English slug जरूरी अछि।"
        }, 400);
      }

      // Category cannot be its own parent
      if (
        parentId &&
        id &&
        Number(parentId) === Number(id)
      ) {
        return json({
          success: false,
          error: "Category अपन parent नहि भ' सकैत अछि।"
        }, 400);
      }

      const description = String(
        body.description || ""
      );

      const menuVisible =
        body.menu_visible === false ? 0 : 1;

      const menuOrder =
        Number(body.menu_order || 0);

      // CREATE
      if (method === "POST") {

        await env.DB.prepare(`
          INSERT INTO categories (
            name,
            slug,
            parent_id,
            description,
            menu_visible,
            menu_order,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `)
          .bind(
            name,
            slug,
            parentId,
            description,
            menuVisible,
            menuOrder
          )
          .run();

        return json({
          success: true,
          message: "Category successfully created."
        });
      }

      // UPDATE
      if (!id) {
        return json({
          success: false,
          error: "ID जरूरी अछि।"
        }, 400);
      }

      await env.DB.prepare(`
        UPDATE categories
        SET
          name = ?,
          slug = ?,
          parent_id = ?,
          description = ?,
          menu_visible = ?,
          menu_order = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(
          name,
          slug,
          parentId,
          description,
          menuVisible,
          menuOrder,
          id
        )
        .run();

      return json({
        success: true,
        message: "Category successfully updated."
      });
    }

    // DELETE
    if (method === "DELETE") {

      if (!canManageAll(user)) {
        return json({
          success: false,
          error: "केवल admin/editor delete करि सकैत छथि।"
        }, 403);
      }

      if (!id) {
        return json({
          success: false,
          error: "ID जरूरी अछि।"
        }, 400);
      }

      // Soft delete
      await env.DB.prepare(`
        UPDATE categories
        SET
          status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(id)
        .run();

      return json({
        success: true,
        message: "Category deleted successfully."
      });
    }

    return json({
      success: false,
      error: "Method not allowed"
    }, 405);

  } catch (error) {

    console.error(
      "CATEGORY API ERROR:",
      error
    );

    return json({
      success: false,
      error: error.message || "Server error"
    }, 500);
  }
}
