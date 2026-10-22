const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');
const { GoogleGenAI } = require('@google/genai');

// Configurations
const GEMINI_API_KEY = "AQ.Ab8RN6LweOSLK7Ds_4aKHPvrcKmrTQ74e3V4XXmxxlV3GvuMYw";
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzMw2ukoq8qbLCOLVCr6nsl9BbNlG66-bqjOYsDZzKUpLJYPLSYQpiccHOMHwOeF2PDNA/exec";
const TARGET_GROUP_NAME = "يومية المبيعات";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('Scan this QR code in WhatsApp to link your account:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        
        // Filter by target group
        if (chat.isGroup && chat.name === TARGET_GROUP_NAME) {
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media && media.mimetype.startsWith('image/')) {
                    console.log('New transaction image received in target group. Processing...');
                    
                    // Call Gemini API to extract data
                    const extractedData = await extractDataWithGemini(media.data, media.mimetype);
                    
                    if (extractedData) {
                        // Send data to Google Sheets
                        await sendToGoogleSheet(extractedData);
                        await msg.react('✅');
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error processing message:', err);
    }
});

async function extractDataWithGemini(base64Data, mimeType) {
    try {
        const prompt = `Analyze this financial transaction image/receipt and extract the following details in JSON format:
        {
          "date": "Transaction date or today's date if not found (YYYY-MM-DD)",
          "customer_name": "Name of the sender/customer if available, otherwise 'Unspecified'",
          "amount": "Total numeric amount transferred",
          "bank": "Bank or Wallet name used (e.g., Vodafone Cash, InstaPay, NBE, CIB, etc.)"
        }
        Return ONLY valid JSON without markdown formatting or code blocks.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                }
            ]
        });

        const textResponse = response.text.trim().replace(/```json|```/g, '');
        return JSON.parse(textResponse);
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return null;
    }
}

async function sendToGoogleSheet(data) {
    try {
        const res = await fetch(GOOGLE_SHEET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        console.log('Sheet Update Status:', result);
    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
    }
}

client.initialize();