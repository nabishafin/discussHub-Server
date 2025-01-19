const express = require('express');
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000;
const app = express();

// Use CORS and JSON middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dkwhsex.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Database collections
let postsDB, announcementDB;

async function run() {
    try {
        // Connect the client to the server
        await client.connect();
        postsDB = client.db("DiscussHubDB").collection("posts");
        announcementDB = client.db("DiscussHubDB").collection("announcement");
        const usersDB = client.db("DiscussHubDB").collection("users");


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        // API routes
        // Get all posts with sorting options (by popularity or time)
        app.get('/posts', async (req, res) => {
            try {
                const sortByPopularity = req.query.sortBy === 'popularity';
                let posts;

                if (sortByPopularity) {
                    // Fetch posts sorted by popularity (upvotes - downvotes)
                    posts = await postsDB.find()
                        .sort({ $expr: { $subtract: ["$upvote_count", "$downvote_count"] } })  // Popularity calculation
                        .toArray();
                } else {
                    // Fetch posts sorted by time (newest first)
                    posts = await postsDB.find()
                        .sort({ time: -1 })  // Sort by creation time (newest first)
                        .toArray();
                }

                // Format the result
                const formattedPosts = posts.map(post => ({
                    _id: post._id,
                    author: post.author,
                    post_title: post.post_title,
                    tags: post.tags,
                    time: post.time,
                    comments_count: post.comments ? post.comments.length : 0,  // Ensures comments is an array
                    upvote_count: post.upvote_count,
                    downvote_count: post.downvote_count,
                    votes_count: post.upvote_count + post.downvote_count,  // Sum of upvotes and downvotes
                    author_img: post.author_img
                }));

                res.send(formattedPosts);
            } catch (error) {
                console.error("Error fetching posts:", error);
                res.status(500).send({ error: 'Failed to fetch posts' });
            }
        });

        // Get details of a single post by id
        app.get("/detailspost/:id", async (req, res) => {
            const id = req.params.id;
            try {
                const query = { _id: new ObjectId(id) };
                const result = await postsDB.findOne(query);
                if (result) {
                    res.send(result);
                } else {
                    res.status(404).send({ error: "Post not found" });
                }
            } catch (error) {
                console.error("Error fetching post details:", error);
                res.status(500).send({ error: 'Failed to fetch post details' });
            }
        });

        // Add an upvote to a post
        app.post("/upvote/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await postsDB.updateOne(
                    { _id: new ObjectId(id) },
                    { $inc: { upvote_count: 1 } } // Increment the upvote count by 1
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: "Post upvoted successfully" });
                } else {
                    res.status(404).send({ error: "Post not found" });
                }
            } catch (error) {
                console.error("Error upvoting the post:", error);
                res.status(500).send({ error: 'Failed to upvote' });
            }
        });

        // Add a downvote to a post
        app.post("/downvote/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await postsDB.updateOne(
                    { _id: new ObjectId(id) },
                    { $inc: { downvote_count: 1 } } // Increment the downvote count by 1
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: "Post downvoted successfully" });
                } else {
                    res.status(404).send({ error: "Post not found" });
                }
            } catch (error) {
                console.error("Error downvoting the post:", error);
                res.status(500).send({ error: 'Failed to downvote' });
            }
        });

        // Add a comment to a post
        app.post("/comment/:id", async (req, res) => {
            const { id } = req.params;
            const { comment } = req.body;  // Assuming comment is sent in the request body
            try {
                const result = await postsDB.updateOne(
                    { _id: new ObjectId(id) },
                    { $push: { comments: comment } } // Push the new comment to the comments array
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: "Comment added successfully" });
                } else {
                    res.status(404).send({ error: "Post not found" });
                }
            } catch (error) {
                console.error("Error adding comment:", error);
                res.status(500).send({ error: 'Failed to add comment' });
            }
        });

        // Announcements API
        app.get('/announcements', async (req, res) => {
            try {
                const result = await announcementDB.find().toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching announcements:", error);
                res.status(500).send({ error: 'Failed to fetch announcements' });
            }
        });

        // Add a new post
        app.post('/posts', async (req, res) => {
            const post = req.body;
            try {
                const result = await postsDB.insertOne(post);
                res.send(result);
            } catch (error) {
                console.error("Error creating post:", error);
                res.status(500).send({ error: 'Failed to create post' });
            }
        });

        // Count posts made by a user (by email)
        app.get('/posts/count/:email', async (req, res) => {
            const { email } = req.params;
            try {
                const postCount = await postsDB.countDocuments({ email });
                res.json({ count: postCount });
            } catch (err) {
                console.error('Error fetching post count:', err);
                res.status(500).json({ message: 'Error fetching post count' });
            }
        });


        app.get('/allposts', async (req, res) => {
            const result = await postsDB.find().toArray();  // Retrieves all posts from the database
            res.send(result);  // Sends the posts as the response
        });


        app.delete("/posts/:id", async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const query = { _id: new ObjectId(id) };
            const result = await postsDB.deleteOne(query);
            res.send(result);
        });


        // user collection by post methods
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersDB.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user alredy exitets' })
            }
            const result = usersDB.insertOne(user)
            res.send(result)
        })




    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);  // Exit the process if MongoDB connection fails
    }
}


run();

// Default route for testing the backend
app.get('/', (req, res) => {
    res.send('Hello from the backend!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
