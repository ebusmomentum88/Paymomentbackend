import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Sequelize, DataTypes } from "sequelize";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CORS setup
app.use(cors({
  origin: ["https://ebuspay.vercel.app", "http://localhost:3000"],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve uploads folder
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ Database setup
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

// ✅ Model
const News = sequelize.define("News", {
  title: DataTypes.STRING,
  content: DataTypes.TEXT,
  imageUrl: DataTypes.STRING,
});

// ✅ Create uploads folder if not exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ✅ Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ✅ Create News (with optional image)
app.post("/api/news", upload.single("image"), async (req, res) => {
  try {
    const { title, content, adminPassword } = req.body;
    if (adminPassword !== process.env.ADMIN_PASSWORD)
      return res.status(403).json({ message: "Unauthorized" });

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const news = await News.create({ title, content, imageUrl });
    res.json({ success: true, message: "News posted successfully", news });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error posting news" });
  }
});

// ✅ Get all News
app.get("/api/news", async (req, res) => {
  try {
    const news = await News.findAll({ order: [["createdAt", "DESC"]] });
    res.json({ success: true, news });
  } catch {
    res.status(500).json({ message: "Error fetching news" });
  }
});

// ✅ Delete News
app.delete("/api/news/:id", async (req, res) => {
  try {
    const { adminPassword } = req.query;
    if (adminPassword !== process.env.ADMIN_PASSWORD)
      return res.status(403).json({ message: "Unauthorized" });

    const news = await News.findByPk(req.params.id);
    if (!news) return res.status(404).json({ message: "Not found" });

    if (news.imageUrl) {
      const filePath = path.join(process.cwd(), news.imageUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await news.destroy();
    res.json({ success: true, message: "News deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting news" });
  }
});

// ✅ Default route
app.get("/", (req, res) => {
  res.send("✅ EbusPay Backend is running...");
});

// ✅ Start server
sequelize.sync().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

