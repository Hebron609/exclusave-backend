import express from "express";
import multer from "multer";
import sharp from "sharp";
import fetch from "node-fetch";
import FormData from "form-data";

const router = express.Router();

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/image-upload
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      console.error("No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Convert to WebP using sharp
    let webpBuffer;
    try {
      webpBuffer = await sharp(req.file.buffer)
        .webp({ quality: 80 })
        .toBuffer();
    } catch (err) {
      console.error("Error converting to WebP:", err);
      return res.status(500).json({ error: "Failed to convert image to WebP" });
    }

    // Prepare form data for Cloudinary
    const formData = new FormData();
    formData.append("file", webpBuffer, {
      filename: req.file.originalname.replace(/\.[^.]+$/, ".webp"),
      contentType: "image/webp",
    });
    formData.append("upload_preset", process.env.CLOUDINARY_UPLOAD_PRESET);

    // Upload to Cloudinary
    let response, data;
    try {
      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
      response = await fetch(cloudinaryUrl, {
        method: "POST",
        body: formData,
      });
      data = await response.json();
    } catch (err) {
      console.error("Error uploading to Cloudinary:", err);
      return res.status(500).json({ error: "Failed to upload to Cloudinary" });
    }

    if (!response.ok) {
      console.error("Cloudinary error:", data);
      return res
        .status(500)
        .json({ error: data.error?.message || "Cloudinary upload failed" });
    }

    if (!data.secure_url) {
      console.error("No secure_url in Cloudinary response:", data);
      return res
        .status(500)
        .json({ error: "No image URL returned from Cloudinary" });
    }

    res.json({ url: data.secure_url });
  } catch (error) {
    console.error("Unexpected error in image upload:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  }
});

export default router;
