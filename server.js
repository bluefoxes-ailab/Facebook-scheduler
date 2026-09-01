require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serves your index.html


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
  const { team, pageId, caption, password, isVideo } = req.body;

 
  if (!teamConfig[team] || teamConfig[team].password !== password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = teamConfig[team].pages[pageId];
  if (!token) return res.status(400).json({ error: 'Invalid Page ID' });

  try {
    const endpoint = isVideo === 'true'
      ? `https://graph.facebook.com/v20.0/${pageId}/videos`
      : `https://graph.facebook.com/v20.0/${pageId}/photos`;

    const form = new FormData();
    form.append('access_token', token);
    form.append('source', req.file.buffer, { filename: req.file.originalname });
    form.append(isVideo === 'true' ? 'description' : 'caption', caption);

    if (req.body.isSchedule === 'true') {
      form.append('published', 'false');
      form.append('scheduled_publish_time', req.body.scheduled_publish_time);
    }

    const fbResponse = await axios.post(endpoint, form, {
      headers: form.getHeaders()
    });

    res.json(fbResponse.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error?.message || 'Upload failed' });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));