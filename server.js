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
      "522957638064464": process.env.ULTIMATE_FREESTYLE_TOKEN,
    }
  },
  beauty: {
    password: process.env.BEAUTY_PASSWORD,
    pages: {
      "254307648319573": process.env.BEAUTY_STUDIO_TOKEN,
      "145836442718844": process.env.BEAUTY_HACKS_TOKEN,
      "102094686197863": process.env.UNWRITTEN_BEAUTY_TOKEN,
      "106158097929721": process.env.RE_BELLE_TOKEN,
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

  const { upload_session_id } = startRes.data;
  let { start_offset, end_offset } = startRes.data;

  // 2. TRANSFER PHASE
  while (start_offset < fileSize) {
    const chunkStream = fs.createReadStream(filePath, {
      start: parseInt(start_offset),
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

  // 3. FINISH PHASE (No targeting applied -> Global visibility)
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
// --- HELPER: Publish Comment to Object ID ---
async function postCommentToObject(objectId, token, message) {
  const endpoint = `https://graph.facebook.com/v20.0/${objectId}/comments`;
  const response = await axios.post(endpoint, null, {
    params: {
      access_token: token,
      message: message
    }
  });
  return response.data; // { id: "comment_id" }
}

// --- HELPER: In-Memory Scheduler for Delayed Comments ---
function scheduleDelayedComment(objectId, token, message, targetEpochSeconds) {
  const targetTimeMs = targetEpochSeconds * 1000;
  // Delay 15-30 seconds after scheduled post time to ensure Graph API has finished indexing the published node
  const delayMs = Math.max(1000, targetTimeMs - Date.now() + 15000); 

  console.log(`[Scheduler] Queued first comment for object ${objectId} in ${(delayMs / 1000).toFixed(0)} seconds.`);

  setTimeout(async () => {
    try {
      const res = await postCommentToObject(objectId, token, message);
      console.log(`[Scheduler Success] Comment published on ${objectId}:`, res.id);
    } catch (err) {
      console.error(`[Scheduler Failed] Could not post scheduled comment on ${objectId}:`, err.response?.data?.error?.message || err.message);
    }
  }, delayMs);
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
  const { 
  team, 
  password, 
  caption, 
  isVideo, 
  firstComment, 
  isSchedule, 
  scheduled_publish_time 
} = req.body;

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
git   // Ensure Universal ID is provided for video uploads
  if (isVideo === 'true' && (!req.body.universalId || !req.body.universalId.trim())) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: "Please enter the Universal ID before publishing the video." });
  }

  const uploadPromises = targetPageIds.map(async (pageId) => {
    const token = teamConfig[team].pages[pageId];
    if (!token) throw new Error(`Token missing or invalid for Page ID: ${pageId}`);

    let uploadResult;

    if (isVideo === 'true') {
      uploadResult = await uploadVideoResumable(pageId, token, req.file.path, caption, req.body);
    } else {
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      const form = new FormData();
      form.append('access_token', token);
      form.append('source', fs.createReadStream(req.file.path), { filename: req.file.originalname });
      form.append('caption', caption);
      
      if (isSchedule === 'true') {
        form.append('published', 'false');
        form.append('scheduled_publish_time', scheduled_publish_time);
      }

      const response = await axios.post(endpoint, form, { headers: form.getHeaders() });
      uploadResult = response.data;
    }

    // Determine the post/video ID generated by Facebook
    const objectId = uploadResult.id || uploadResult.post_id;

    // First Comment Execution
    let commentResult = null;
    if (firstComment && firstComment.trim() !== '' && objectId) {
      if (isSchedule === 'true') {
        scheduleDelayedComment(objectId, token, firstComment.trim(), parseInt(scheduled_publish_time));
        commentResult = { status: 'scheduled' };
      } else {
        try {
          const commentRes = await postCommentToObject(objectId, token, firstComment.trim());
          commentResult = { status: 'published', id: commentRes.id };
        } catch (cErr) {
          console.error(`First comment error on ${objectId}:`, cErr.response?.data?.error?.message || cErr.message);
          commentResult = { status: 'failed', error: cErr.response?.data?.error?.message || cErr.message };
        }
      }
    }

    return { pageId, data: uploadResult, comment: commentResult };
  });

  const results = await Promise.allSettled(uploadPromises);

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

  const uId = req.body.universalId ? req.body.universalId.trim() : 'N/A';
  const logEntry = `${new Date().toISOString()},${team},${uId},US-Server,${successful.length},${failed.length}\n`;
  
  fs.appendFile('post_analytics.csv', logEntry, (err) => {
    if (err) console.error("Failed to write to analytics log:", err);
  });

  return res.json({
    success: true,
    publishedCount: successful.length,
    failedCount: failed.length,
    results: successful,
    errors: failed
  });
});
app.post('/api/comment', async (req, res) => {
  const { team, password, pageId, objectId, comment } = req.body;

  // 1. Validate team authentication
  if (!teamConfig[team] || teamConfig[team].password !== password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Validate Page Token
  const token = teamConfig[team].pages[pageId];
  if (!token) {
    return res.status(400).json({ error: 'Invalid Page ID or missing token for this team' });
  }

  // 3. Validate Inputs
  if (!objectId || !comment || !comment.trim()) {
    return res.status(400).json({ error: 'Both Object ID and comment message are required' });
  }

  // 4. Send comment to Facebook
  try {
    const data = await postCommentToObject(objectId.trim(), token, comment.trim());
    return res.json({ success: true, commentId: data.id });
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    return res.status(500).json({ error: errorMsg });
  }
});
app.get('/api/download-analytics', (req, res) => {
  const filePath = path.join(__dirname, 'post_analytics.csv');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'post_analytics.csv');
  } else {
    res.status(404).send('No analytics data logged yet on this server instance.');
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));