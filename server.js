const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const pdfPoppler = require("pdf-poppler");

// Fix: Use absolute folder paths
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");

// Ensure folders exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Serve static files
app.use(express.static("public"));


// Multer upload directory (absolute path)
const upload = multer({ dest: uploadDir });

 app.post("/convert", upload.single("pdfFile"), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const fileName = uuidv4() + ".pdf";
    const outputPath = path.join(outputDir, fileName);

    const opts = {
      format: "png",
      out_dir: uploadDir,
      out_prefix: "page",
      page: null,
    };

    await pdfPoppler.convert(inputPath, opts);

    const newPdf = await PDFDocument.create();
    let pageIndex = 1;

    const { imageSize } = require("image-size");

    while (true) {
      const pngPath = path.join(uploadDir, `page-${pageIndex}.png`);
      if (!fs.existsSync(pngPath)) break;

      // --------- Read PNG ----------
      const imageBytes = fs.readFileSync(pngPath);
      const image = await newPdf.embedPng(imageBytes);
      const { width: pageWidth, height: pageHeight } = image.scale(1);

      // NEW PDF PAGE
      const page = newPdf.addPage([pageWidth, pageHeight]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });

      // --------- Get REAL Pixel Size (ONLY ONCE) ----------
      const buf = fs.readFileSync(pngPath);
      const { width: imgPxW, height: imgPxH } = imageSize(buf);

      // Pixel → PDF scale
      const scaleX = pageWidth / imgPxW;
      const scaleY = pageHeight / imgPxH;

      // --------- OCR ---------
      const ocr = await Tesseract.recognize(pngPath, "eng");
      const words = ocr.data.symbols || [];

      const font = await newPdf.embedFont(StandardFonts.Helvetica);

      // --------- Draw Invisible Text ----------
      for (const w of words) {
        const text = (w.text || "").trim();
        if (!text) continue;

        const bx = w.bbox.x0;
        const by = w.bbox.y0;
        const bw = w.bbox.x1 - w.bbox.x0;
        const bh = w.bbox.y1 - w.bbox.y0;

        // Convert pixel → PDF coords
        const x = bx * scaleX;
        const y = pageHeight - ((by + bh) * scaleY);

        const fontSize = Math.max(6, bh * scaleY * 0.9);

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          opacity: 0,
        });
      }

      fs.unlinkSync(pngPath);
      pageIndex++;
    }

    // Save final PDF
    const pdfBytes = await newPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);

    fs.unlinkSync(inputPath);

    res.json({
      success: true,
      downloadUrl: `/download/${fileName}`,
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Conversion failed" });
  }
});



// Download file
app.get("/download/:file", (req, res) => {
  const filePath = path.join(outputDir, req.params.file);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.send("File not found");
  }
});

// Default home page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/home.html");
});

app.listen(3000, () => console.log("Server running on port 3000"));
