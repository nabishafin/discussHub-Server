const express = require('express');
const cors = require("cors");
const jwt = require('jsonwebtoken');
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




        // jwt releted Api
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SCERET, {
                expiresIn: '1h'
            });
            res.send({ token })
        })

        //    middlewares 
        // token
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SCERET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized Access' });
                }
                req.decoded = decoded;
                next();
            });
        }


        // verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersDB.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            next();
        }

        // admin role note : verify admin kora jabena
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forBidden access' })
            }
            const query = { email: email }
            const user = await usersDB.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin })

        })


        //make admin role
        app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersDB.updateOne(filter, updatedDoc)
            res.send(result)
        })

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

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

            const result = await usersDB.find().toArray();
            res.send(result)
        })


        // make annouchment
        app.post('/announcement', async (req, res) => {
            const anouncementItem = req.body
            const result = await announcementDB.insertOne(anouncementItem)
            res.send(result)
        })

        app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersDB.deleteOne(query);
            res.send(result);
        });

        // Endpoint to get total votes, number of users, and number of comments
        // Endpoint to get total votes, number of users, number of posts, and number of comments
        app.get('/stats', async (req, res) => {
            try {
                // Total number of posts
                const totalPosts = await postsDB.countDocuments();

                // Total number of votes (sum of upvotes and downvotes for all posts)
                const posts = await postsDB.find().toArray();
                const totalVotes = posts.reduce((acc, post) => acc + post.upvote_count + post.downvote_count, 0);

                // Total number of users
                const totalUsers = await usersDB.countDocuments();

                // Total number of comments (sum of the length of the comments array for all posts)
                const totalComments = posts.reduce((acc, post) => acc + (post.comments ? post.comments.length : 0), 0);

                // Send the results as a response
                res.json({
                    totalPosts,
                    totalVotes,
                    totalUsers,
                    totalComments
                });
            } catch (error) {
                console.error("Error fetching statistics:", error);
                res.status(500).send({ error: 'Failed to fetch statistics' });
            }
        });





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

