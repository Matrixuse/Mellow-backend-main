# 🎵 Mellow – Play & Relax (Backend)

<div align="center">

### Backend API for Mellow Music Streaming Platform

</div>

---

# 🚀 Try it Now

The backend REST API is deployed and publicly accessible.

### 🌐 Live API

👉 **Backend API:** https://mellow-backend-main.onrender.com

### 🔗 API Health Check

You can verify that the backend is running by visiting:

```
https://mellow-backend-main.onrender.com/
```

or your health endpoint:

```
https://mellow-backend-main.onrender.com/api/health
```

> **Note**
>
> This API is hosted on Render's free tier. The first request after a period of inactivity may take **30–60 seconds** while the service wakes up.

---

# 📖 Overview

This repository contains the backend of **Mellow – Play & Relax**, a complete music streaming platform.

The backend provides secure REST APIs for authentication, music management, playlists, user profiles, favorites, queue handling, album management, artist management, and admin operations.

It is built using **Node.js**, **Express.js**, and **MongoDB**, following scalable backend architecture.

---

# ✨ Features

## 👤 Authentication

- User Registration
- User Login
- JWT Authentication
- Password Encryption
- Protected Routes

---

## 🎵 Song Management

- Upload Songs
- Edit Songs
- Delete Songs
- Stream Songs
- Song Metadata

---

## 💿 Album Management

- Create Album
- Update Album
- Delete Album
- Album Songs

---

## 👨‍🎤 Artist Management

- Add Artist
- Update Artist
- Artist Songs
- Artist Albums

---

## ❤️ Favorites

- Add Favorite
- Remove Favorite
- Fetch Favorite Songs

---

## 📂 Playlist

- Create Playlist
- Update Playlist
- Delete Playlist
- Add Songs
- Remove Songs

---

## 📜 Queue

- Add to Queue
- Remove from Queue
- Queue Ordering

---

## 🔎 Search

- Search Songs
- Search Albums
- Search Artists

---

## 👤 User Profile

- User Details
- Update Profile
- Profile Picture

---

## 📡 REST APIs

- Secure API Endpoints
- JSON Responses
- Error Handling
- Validation

---

# 🛠 Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT
- bcrypt
- Multer
- Cloudinary
- dotenv

---

# 📂 Project Structure

```
Backend/
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── app.js
│
├── server.js
├── package.json
└── .env
```

---

# 🚀 Installation

Clone repository

```bash
git clone https://github.com/Matrixuse/Mellow-backend-main.git
```

Install packages

```bash
npm install
```

Start development server

```bash
npm run dev
```

Start production

```bash
npm start
```

---

# 🌐 Environment Variables

Create a `.env` file.

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name

CLOUDINARY_API_KEY=your_api_key

CLOUDINARY_API_SECRET=your_api_secret
```

---

# 📡 API Modules

- Authentication
- Songs
- Albums
- Artists
- Playlists
- Queue
- Favorites
- Search
- Users

---

# 🔒 Security

- JWT Authentication
- Password Hashing
- Input Validation
- Protected Routes
- Secure Environment Variables

---

# 📈 Scalability

- Modular Architecture
- RESTful API
- MVC Pattern
- Error Handling Middleware
- Database Optimization

---

# 🔮 Future Enhancements

- AI Song Recommendation
- Lyrics API
- Podcast Support
- Real-time Listening Together
- Notification Service
- Analytics Dashboard
- Recommendation Engine
- Voice Assistant Integration

---

# 🤝 Contributing

Contributions are welcome.

Fork the repository and submit a Pull Request.

---

# 👨‍💻 Developer

**Naman Sharma**

B.Tech Computer Science

Full Stack Developer
