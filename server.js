const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto'); // Import Node.js crypto module
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Create connections to both databases
const telegramCommunitiesConnection = mongoose.createConnection("mongodb+srv://pawanajjark:y5A6YsqwwYrQhckO@cluster0.lixwl.mongodb.net/telegram_communities?retryWrites=true&w=majority&appName=Cluster0");
const testConnection = mongoose.createConnection("mongodb+srv://pawanajjark:y5A6YsqwwYrQhckO@cluster0.lixwl.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0");

// User model (in test database)
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  walletAddress: { type: String, unique: true, sparse: true }
});

const User = testConnection.model('User', UserSchema);

// Community User model (in telegram_communities database)
const CommunityUserSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  user_name: { type: String },
  name: { type: String },
  TeleTokens_CustodialAddress: { type: String },
  data: { type: String },
  community_name: { type: String }
});

const CommunityUser = telegramCommunitiesConnection.model('CommunityUser', CommunityUserSchema, 'community_users');

// NFT Pack model (in test database)
const NFTPackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  id: { type: Number, unique: true },
  negative: { type: String },
  keywords: { type: String },
  imageUrl: { type: String },
  altText: { type: String }
});

const NFTPack = testConnection.model('NFTPack', NFTPackSchema);

// Decryption function using Node.js crypto module
function decrypt(key, source, decode = true) {
  if (decode) {
    source = Buffer.from(source, 'base64');
  }

  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const iv = source.slice(0, 16);
  const encryptedText = source.slice(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  // Handle padding
  const padding = decrypted[decrypted.length - 1];
  if (padding > 0 && padding <= 16) {
    const padded = decrypted.slice(-padding);
    if (padded.equals(Buffer.alloc(padding, padding))) {
      decrypted = decrypted.slice(0, -padding);
    }
  }

  return decrypted.toString('utf8');
}

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { username, password, walletAddress } = req.body;
    if (!username || !password || !walletAddress) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const user = new User({ username, password, walletAddress });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
    console.log("User created successfully", user);
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error: error.message });
    console.error("Error creating user", error);
  }
});

app.get('/api/list-databases', async (req, res) => {
  try {
    const adminDb = mongoose.connection.useDb('admin');
    const result = await adminDb.db.admin().listDatabases();
    const databases = result.databases.map(db => db.name);
    const databaseCount = databases.length;
    res.json({
      count: databaseCount,
      databases: databases
    });
  } catch (error) {
    console.error('Error listing databases:', error);
    res.status(500).json({ message: 'Error listing databases', error: error.message });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, walletAddress } = req.body;
    let user;

    if (walletAddress) {
      user = await User.findOne({ walletAddress });
    } else if (username && password) {
      user = await User.findOne({ username });
      if (user && user.password !== password) {
        user = null;
      }
    } else {
      return res.status(400).json({ message: 'Invalid login credentials' });
    }

    if (!user) {
      return res.status(400).json({ message: 'User not found or invalid credentials' });
    }

    res.json({ message: 'Login successful', userId: user._id });
    console.log("Login successful", user);
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
    console.error("Error logging in", error);
  }
});

// Fetch NFT Packs route
app.get('/api/nft-packs', async (req, res) => {
  try {
    const nftPacks = await NFTPack.find();
    res.json(nftPacks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching NFT packs', error: error.message });
    console.error("Error fetching NFT packs", error);
  }
});

// New route to fetch community user data
app.get('/api/community-user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('Searching for user with ID:', userId);

    const user = await CommunityUser.findOne(
      { user_id: userId },
      'TeleTokens_CustodialAddress data'
    );

    if (!user) {
      console.log('User not found:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      custodialAddress: user.TeleTokens_CustodialAddress,
      data: user.data
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching community user data', error: error.message });
    console.error("Error fetching community user data", error);
  }
});

// Fetch all community users
app.get('/api/community-users', async (req, res) => {
  try {
    const communityUsers = await CommunityUser.find();
    res.json(communityUsers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching community users', error: error.message });
    console.error("Error fetching community users", error);
  }
});

// New route to decrypt user data
app.get('/api/decrypt-user-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const key = userId; // Replace with your actual secret key

    // Fetch the community user data
    const user = await CommunityUser.findOne({ user_id: userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Decrypt the data
    const decryptedData = decrypt(key, user.data);

    res.json({
      decryptedData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error decrypting user data', error: error.message });
    console.error("Error decrypting user data", error);
  }
});

// Initialize NFT Packs
async function initializeNFTPacks() {
  const nftData = [
    { 
      title: "Good Pack", 
      price: 100, 
      id: 1, 
      negative: "Evil Expression, Scowl, Frown, No beard,Sarcastic Smile,blurry images", 
      keywords: "Cartoon, Exagerated,Handsome, Beautiful, Detailed Animation, Animated, No Background, Black Background, Happy, Long hair, Always bearded",
      imageUrl: "https://res.cloudinary.com/dkewhgebd/image/upload/v1724837797/copsdqwxvevwbkvll2hy.jpg",
      altText: "Good Pack NFT"
    },
    { 
      title: "Evil Pack", 
      price: 150, 
      id: 2, 
      negative: "Good Expression, Smile, blurry images", 
      keywords: "Evil ,Cartoon, Exagerated,Handsome, Beautiful, Detailed Animation, Animated, No Background, Black Background, Happy, Long hair, Always bearded, Sarcastic smile",
      imageUrl: "https://res.cloudinary.com/dkewhgebd/image/upload/v1724837806/qhyaseccdm25i8zhqsc8.jpg",
      altText: "Evil Pack NFT"
    },
    {
      title: "Ethereum Pack",
      price: 200,
      id: 3,
      negative: "Bitcoin symbols, Dollar signs, Confusion, Blurry images",
      keywords: "Ethereum, ETH, Cryptocurrency, Blockchain, Smart Contracts, Decentralized, Vitalik Buterin, Animated, No Background, Detailed Illustration, Futuristic, Tech",
      imageUrl: "https://res.cloudinary.com/dkewhgebd/image/upload/v1724837803/jcqlnfvtjsvzlah4filf.jpg",
      altText: "Ethereum Pack NFT"
    },
    {
      title: "Bitcoin Pack",
      price: 200,
      id: 4,
      negative: "Ethereum symbols, Bank buildings, Paper money, Blurry images",
      keywords: "Bitcoin, BTC, Cryptocurrency, Blockchain, Satoshi Nakamoto, Digital Gold, Animated, No Background, Detailed Illustration, Decentralized, Finance, Mining",
      imageUrl: "https://res.cloudinary.com/dkewhgebd/image/upload/v1724837804/bqmtrtvckxfqf4sad6aq.jpg",
      altText: "Bitcoin Pack NFT"
    }
  ];

  try {
    for (const pack of nftData) {
      await NFTPack.findOneAndUpdate({ id: pack.id }, pack, { upsert: true, new: true });
    }
    console.log("NFT Packs initialized successfully");
  } catch (error) {
    console.error("Error initializing NFT Packs:", error);
  }
}

// Connect to MongoDB and start the server
Promise.all([
  telegramCommunitiesConnection.asPromise(),
  testConnection.asPromise()
])
  .then(() => {
    console.log('Connected to MongoDB Atlas (telegram_communities and test databases)');
    initializeNFTPacks(); // Initialize NFT Packs after connecting to MongoDB
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });
