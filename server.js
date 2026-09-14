require('dotenv').config();
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname))); 

const teamConfig = {
  gaming: {
    password: process.env.GAMING_PASSWORD,
    pages: {
      "894332950616089": process.env.GAMOLOGY_TOKEN,
      "115642145136159": process.env.GAMERS_ON_BOARD_TOKEN,
      "158184731454410": process.env.PIXEL_HEROES_TOKEN,
      "184753692121622": process.env.GAMER_FORECAST_TOKEN,
      "104241008734361": process.env.SHIFT_FIRE_TOKEN,
      "1383863451698458": process.env.GAMOLOGY_ASIA_TOKEN,
      "461052150760556": process.env.FRAGS_AND_SKILLS_TOKEN,
      "1429851870430172": process.env.GAMOLOGY_CREATORS_NETWORK_TOKEN,
      "132863274153701": process.env.SWEET_MEMORIES_TOKEN,
    }
  },
  trueCrime: {
    password: process.env.TRUECRIME_PASSWORD,
    pages: {
      "107635881202158": process.env.KILLER_BITES_TOKEN,
      "111107098020809": process.env.BINGE_SOCIETY_TOKEN,
      "101581832346980": process.env.FATAL_FILES_TOKEN,
    }
  },
  Karma: {
    password: process.env.KARMA_PASSWORD,
    pages: {
      "114227735048877": process.env.KARMA_MOMENTS_TOKEN,
      "109971608789113": process.env.KARMA_CHRONICLES_TOKEN,
      "104262996056582": process.env.KARMA_CENTRAL_TOKEN,
      "1917462381705981": process.env.BUZZER_BEATER_TOKEN,
      "117880948011569": process.env.DARK_CHRONICLES_TOKEN,
      "111069038279400": process.env.BINGE_TV_TOKEN,
      "100742323080074": process.env.MYSTIC_CHRONICLES_TOKEN,
      "115090033689282": process.env.SUPERMISSION_TOKEN,
      "106037948551056": process.env.GADGET_RADAR_TOKEN,
      "100327096455522": process.env.UNBROKEN_CHRONICLES_TOKEN,
      "103817179282493": process.env.PROTECTOR_CHRONICLES_TOKEN,
    }
  },
sports: {
  password: process.env.SPORTS_PASSWORD,
  pages: {
    "109559704772146": process.env.FIGHT_SOURCE_TOKEN,
  }

}
};

// --- HELPER: Resumable Video Upload ---
async function uploadVideoResumable(pageId, token, filePath, caption, reqBody) {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const baseUrl = `https://graph.facebook.com/v20.0/${pageId}/videos`;

  // 1. START PHASE
  const startRes = await axios.post(baseUrl, null, {
    params: {
      upload_phase: 'start',
      access_token: token,
      file_size: fileSize
    }
  });

  const { upload_session_id, video_id } = startRes.data;
  let { start_offset, end_offset } = startRes.data;

  // 2. TRANSFER PHASE
  while (start_offset < fileSize) {
    const chunkStream = fs.createReadStream(filePath, {
      start: parseInt(start_offset),
      // fs.createReadStream 'end' is inclusive, so we subtract 1 from Facebook's offset
      end: parseInt(end_offset) > 0 ? parseInt(end_offset) - 1 : undefined
    });

    const form = new FormData();
    form.append('upload_phase', 'transfer');
    form.append('access_token', token);
    form.append('upload_session_id', upload_session_id);
    form.append('start_offset', start_offset.toString());
    form.append('video_file_chunk', chunkStream, { filename: 'chunk.mp4' });

    const transferRes = await axios.post(baseUrl, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    start_offset = transferRes.data.start_offset;
    end_offset = transferRes.data.end_offset;
  }

  // 3. FINISH PHASE
  const finishForm = new FormData();
  finishForm.append('upload_phase', 'finish');
  finishForm.append('access_token', token);
  finishForm.append('upload_session_id', upload_session_id);
  finishForm.append('description', caption);

  if (reqBody.universalId) {
    finishForm.append('universal_video_id', reqBody.universalId);
  }

  if (reqBody.isSchedule === 'true') {
    finishForm.append('published', 'false');
    finishForm.append('scheduled_publish_time', reqBody.scheduled_publish_time);
  }

  const finishRes = await axios.post(baseUrl, finishForm, {
    headers: finishForm.getHeaders()
  });

  return finishRes.data;
}

// --- API ROUTES ---

app.post('/api/verify', (req, res) => {
  const { team, password } = req.body;
  if (teamConfig[team] && teamConfig[team].password === password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/publish', upload.single('media'), async (req, res) => {
  const { team, password, caption, isVideo } = req.body;

  if (!teamConfig[team] || teamConfig[team].password !== password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let targetPageIds = [];
  try {
    targetPageIds = req.body.pageIds ? JSON.parse(req.body.pageIds) : [req.body.pageId];
  } catch {
    return res.status(400).json({ error: 'Invalid Page IDs format' });
  }

  if (!Array.isArray(targetPageIds) || targetPageIds.length === 0) {
    return res.status(400).json({ error: 'No target pages selected' });
  }

  const uploadPromises = targetPageIds.map(async (pageId) => {
    const token = teamConfig[team].pages[pageId];
    if (!token) throw new Error(`Token missing or invalid for Page ID: ${pageId}`);

    // If Video -> Use Chunked Upload. If Image -> Use Standard Direct Upload.
    if (isVideo === 'true') {
      const data = await uploadVideoResumable(pageId, token, req.file.path, caption, req.body);
      return { pageId, data };
    } else {
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      const form = new FormData();
      form.append('access_token', token);
      form.append('source', fs.createReadStream(req.file.path), { filename: req.file.originalname });
      form.append('caption', caption);
      
      if (req.body.isSchedule === 'true') {
        form.append('published', 'false');
        form.append('scheduled_publish_time', req.body.scheduled_publish_time);
      }

      const response = await axios.post(endpoint, form, { headers: form.getHeaders() });
      return { pageId, data: response.data };
    }
  });

  const results = await Promise.allSettled(uploadPromises);

  // Clean up: Delete the temporary file
  if (req.file && req.file.path) {
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Failed to delete temp file:", err);
    });
  }

  const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failed = results.filter(r => r.status === 'rejected')
    .map(r => r.reason?.response?.data?.error?.message || r.reason?.message || 'Upload failed');

  if (successful.length === 0) {
    return res.status(500).json({ error: `All uploads failed: ${failed.join(' | ')}` });
  }

  return res.json({
    success: true,
    publishedCount: successful.length,
    failedCount: failed.length,
    results: successful,
    errors: failed
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));