require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

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
  }

};

app.post('/api/verify', (req, res) => {
  const { team, password } = req.body;
  if (teamConfig[team] && teamConfig[team].password === password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/publish', upload.single('media'), async (req, res) => {
  const { team, password, caption, isVideo, universalId } = req.body;

  // 1. Password Verification
  if (!teamConfig[team] || teamConfig[team].password !== password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Parse Incoming Page ID(s)
  let targetPageIds = [];
  try {
    if (req.body.pageIds) {
      targetPageIds = JSON.parse(req.body.pageIds);
    } else if (req.body.pageId) {
      targetPageIds = [req.body.pageId];
    }
  } catch {
    return res.status(400).json({ error: 'Invalid Page IDs payload format' });
  }

  if (!Array.isArray(targetPageIds) || targetPageIds.length === 0) {
    return res.status(400).json({ error: 'No target pages selected' });
  }

  // 3. Publish to all pages in parallel
  const uploadPromises = targetPageIds.map(async (pageId) => {
    const token = teamConfig[team].pages[pageId];
    if (!token) {
      throw new Error(`Token missing or invalid Page ID: ${pageId}`);
    }

    const endpoint = isVideo === 'true'
      ? `https://graph.facebook.com/v20.0/${pageId}/videos`
      : `https://graph.facebook.com/v20.0/${pageId}/photos`;

    const form = new FormData();
    form.append('access_token', token);
    form.append('source', req.file.buffer, { filename: req.file.originalname });
    form.append(isVideo === 'true' ? 'description' : 'caption', caption);

    if (universalId) {
      form.append('universal_video_id', universalId);
    }

    if (req.body.isSchedule === 'true') {
      form.append('published', 'false');
      form.append('scheduled_publish_time', req.body.scheduled_publish_time);
    }

    const response = await axios.post(endpoint, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return { pageId, data: response.data };
  });

  const results = await Promise.allSettled(uploadPromises);

  // 4. Summarize successes and failures
  const successful = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.response?.data?.error?.message || r.reason?.message || 'Upload failed');

  if (successful.length === 0) {
    return res.status(500).json({
      error: `All uploads failed: ${failed.join(' | ')}`
    });
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