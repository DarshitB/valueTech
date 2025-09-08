const db = require("../../../db");

const orderMediaDocument = {
  // Find document by ID
  findById: async (id) => {
    const document = await db("order_media_documents")
      .leftJoin("users as created_user", "order_media_documents.created_by", "created_user.id")
      .leftJoin("users as deleted_user", "order_media_documents.deleted_by", "deleted_user.id")
      .where({ "order_media_documents.id": id })
      .whereNull("order_media_documents.deleted_at")
      .select(
        "order_media_documents.*",
        "created_user.name as created_by_name",
        "deleted_user.name as deleted_by_name"
      )
      .first();

    return document;
  },

  // Find documents by order ID
  findByOrderId: async (orderId) => {
    const documents = await db("order_media_documents")
      .leftJoin("users as created_user", "order_media_documents.created_by", "created_user.id")
      .leftJoin("users as deleted_user", "order_media_documents.deleted_by", "deleted_user.id")
      .where({ order_id: orderId })
      .whereNull("order_media_documents.deleted_at")
      .orderBy("order_media_documents.created_at", "desc")
      .select(
        "order_media_documents.*",
        "created_user.name as created_by_name",
        "deleted_user.name as deleted_by_name"
      );

    return documents;
  },

  // Find documents by type
  findByType: async (documentType) => {
    const documents = await db("order_media_documents")
      .leftJoin("users as created_user", "order_media_documents.created_by", "created_user.id")
      .where({ document_type: documentType })
      .whereNull("order_media_documents.deleted_at")
      .orderBy("order_media_documents.created_at", "desc")
      .select(
        "order_media_documents.*",
        "created_user.name as created_by_name"
      );

    return documents;
  },

  // Find documents by media type
  findByMediaType: async (mediaType) => {
    const documents = await db("order_media_documents")
      .leftJoin("users as created_user", "order_media_documents.created_by", "created_user.id")
      .where({ media_type: mediaType })
      .whereNull("order_media_documents.deleted_at")
      .orderBy("order_media_documents.created_at", "desc")
      .select(
        "order_media_documents.*",
        "created_user.name as created_by_name"
      );

    return documents;
  },

  // Insert a new document record
  createDocument: async (documentData) => {
    const [result] = await db("order_media_documents")
      .insert(documentData)
      .returning("id");

    return result.id;
  },

  // Soft delete document
  softDelete: async (id, deletedBy) => {
    const result = await db("order_media_documents")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        deleted_at: new Date(),
        deleted_by: deletedBy,
      });

    return result > 0;
  },

  // Get document count by order ID
  countByOrderId: async (orderId) => {
    const result = await db("order_media_documents")
      .where({ order_id: orderId })
      .whereNull("deleted_at")
      .count("id as count")
      .first();

    return parseInt(result.count);
  },
};

module.exports = orderMediaDocument;
