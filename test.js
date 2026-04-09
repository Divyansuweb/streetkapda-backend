const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://streetkapda_admin:Admin%40123456@streetkapda-cluster.k2sbevc.mongodb.net/streetkapda?retryWrites=true&w=majority";

console.log("🔄 Attempting to connect to MongoDB...");
console.log("📡 Connection string:", MONGODB_URI.replace(/streetkapda%40123456/g, '********'));

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅✅✅ MongoDB Connected Successfully! ✅✅✅");
    console.log("🎉 Your database is working!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌❌❌ Connection Failed! ❌❌❌");
    console.error("Error message:", err.message);
    console.error("\n💡 Troubleshooting tips:");
    console.error("1. Check if your password is correct");
    console.error("2. Make sure your IP is whitelisted in MongoDB Atlas");
    console.error("3. Verify the cluster name is correct");
    process.exit(1);
  });