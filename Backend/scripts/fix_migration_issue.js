require("dotenv").config();
const knex = require("knex");
const knexfile = require("../knexfile");

async function fixMigrationIssue() {
  const oldMigrationName = "20251101080933_022_add_audit_columns_to_attendance.js";
  const environment = "development"; // Force development environment
  const config = knexfile[environment];
  
  let db;
  
  try {
    console.log(`Connecting to ${environment} database...`);
    db = knex(config);
    
    // Test connection
    await db.raw("SELECT 1");
    console.log("✅ Database connection successful!\n");
    
    console.log(`Looking for migration record: ${oldMigrationName}`);
    
    // Check if the record exists
    const record = await db("knex_migrations")
      .where("name", oldMigrationName)
      .first();
    
    if (record) {
      console.log(`Found problematic migration record. Removing it...`);
      
      // Remove the record
      const deleted = await db("knex_migrations")
        .where("name", oldMigrationName)
        .delete();
      
      if (deleted > 0) {
        console.log(`✅ Successfully removed migration record!\n`);
      } else {
        console.log(`⚠️  No records were deleted.\n`);
      }
    } else {
      console.log(`ℹ️  Migration record not found in database. It may have already been removed.\n`);
    }
    
    // Show current migration status
    console.log("Current migrations in database:");
    const allMigrations = await db("knex_migrations")
      .select("name", "batch", "migration_time")
      .orderBy("id");
    
    if (allMigrations.length === 0) {
      console.log("  (No migrations found)");
    } else {
      allMigrations.forEach((m, index) => {
        const time = m.migration_time ? new Date(m.migration_time).toLocaleString() : "N/A";
        console.log(`  ${index + 1}. ${m.name}`);
        console.log(`     Batch: ${m.batch}, Time: ${time}`);
      });
    }
    
    console.log(`\n✅ Migration issue fixed! You can now run 'npm run migrate:dev'`);
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    
    if (error.code === "28P01") {
      console.error("\n💡 Database authentication failed.");
      console.error("   Please check your .env file and ensure:");
      console.error("   - DB_DEV_HOST is correct");
      console.error("   - DB_DEV_USER is correct");
      console.error("   - DB_DEV_PASSWORD is correct");
      console.error("   - DB_DEV_NAME is correct");
      console.error("\n   Or run this SQL manually:");
      console.error(`   DELETE FROM knex_migrations WHERE name = '${oldMigrationName}';`);
    } else if (error.code === "ECONNREFUSED") {
      console.error("\n💡 Cannot connect to database server.");
      console.error("   Please ensure your database server is running.");
    } else {
      console.error("\n💡 If you can't connect, run this SQL manually in your database:");
      console.error(`   DELETE FROM knex_migrations WHERE name = '20251101080933_022_add_audit_columns_to_attendance.js';`);
    }
    
    process.exit(1);
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

fixMigrationIssue();

