const PORT = 5050;
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const app = express();
const https = require('https');
const fs = require('fs');
const { type } = require("os");
const { error } = require("console");
const connectDB = require("./db/connectDB.js");
const cloudinary = require("./utils/cloudinary.js")
const upload = require("./middleware/multer.js")
const dotenv = require("dotenv");
dotenv.config();



// Middleware setup
app.use(express.json()); // JSON parsing
app.use(cors()); // Cross-origin resource sharing

app.use(cors({
    origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
}));


//Database connection
const start = async () => {
    try {
        await connectDB(process.env.MONGO_URI);
        app.listen(PORT, () => console.log(`Server has started on ${PORT}`));
    } catch (error) {
        console.log(error);
    }
};

start();

// Root endpoint
app.get("/", (req, res) => {
    res.send("Express app running");
})

//Multer configuration for image handling

// const storage = multer.diskStorage({
//     destination: './upload/images',
//     filename: (req, file, cb) => {
//         return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
//     }
// })

// const upload = multer({ storage: storage })

// Endpoint for serving uploaded images
app.use('/images', express.static('upload/images'))

// Endpoint for uploading images
app.post("/upload", upload.single('product'), async (req, res) => {
    try {
        const result = await cloudinary.uploader.upload(req.file.path);
        res.json({
            success: 1,
            image_url: result.secure_url
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: 0 });
    } finally {
        // Remove the temporary local file
        fs.unlinkSync(req.file.path);
    }
});

// Making schema for product

const Product = mongoose.model("Product", {
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    inStock: {
        type: Boolean,
        default: true,
    },
})


// API for adding products

app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    //logic for incrementing id by 1
    if (products.length > 0) {
        let lastProductArray = products.slice(-1);
        let lastProduct = lastProductArray[0];
        id = lastProduct.id + 1;
    }
    else {
        id = 1;
    }

    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image,
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
    })
    //displaying product just to check if it is ready or not
    // console.log(product);
    await product.save();
    console.log("After save");
    res.json({
        success: true,
        name: req.body.name,
    })
})

// API for deleting products
app.post("/deleteproduct", async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    res.json({
        success: true,
        name: req.body.name
    })
})

// API for getting all products
app.get("/allproducts", async (req, res) => {
    //getting all products
    let products = await Product.find({});
    // console.log(products);
    res.send(products);

})

// User schema
const Users = mongoose.model('Users', {
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
    },
    password: {
        type: String,
    },
    cartData: {
        type: Object,
    }
})

// API for user signup

app.post('/signup', async (req, res) => {
    let validateEmail = await Users.findOne({ email: req.body.email });
    if (validateEmail) {
        return res.status(400).json({ success: false, error: "Email already exists with different account" })
    }
    let cart = {};
    for (let i = 0; i < 200; i++) {
        cart[i] = 0;
    }
    const user = new Users({
        name: req.body.username,
        email: req.body.email,
        password: req.body.password,
        cartData: cart,
    })
    await user.save();

    const authData = {
        user: {
            id: user.id
        }
    }

    const token = jwt.sign(authData, 'ecom_token');
    res.json({ success: true, token })
})

// API for user login
// app.post('/login', async (req, res) => {
//     let user = await Users.findOne({ email: req.body.email });
//     if (user) {
//         const validatePassword = req.body.password === user.password;

//         if (validatePassword) {
//             const data = {
//                 user: {
//                     id: user.id
//                 }
//             }
//             const token = jwt.sign(data, 'ecom_token');
//             res.json({ success: true, token });
//         }
//         else {
//             res.json({ success: false, errors: "Password is incorrect" });
//         }
//     }
//     else {
//         res.json({ success: false, errors: "Email Id doesn't exist" })
//     }
// })

app.post('/login', async (req, res) => {
    let user = await Users.findOne({ email: req.body.email });
    if (user) {
        const validatePassword = req.body.password === user.password;

        if (validatePassword) {
            // Check if the client has sent cartData
            if (req.body.cartData) {
                // Merge the client-side cartData with the server-side cartData
                user.cartData = { ...user.cartData, ...req.body.cartData };
                await user.save();
            }

            const data = {
                user: {
                    id: user.id,
                },
            };
            const token = jwt.sign(data, 'ecom_token');
            res.json({ success: true, token });
        } else {
            res.json({ success: false, errors: 'Password is incorrect' });
        }
    } else {
        res.json({ success: false, errors: "Email Id doesn't exist" });
    }
});

// Middleware for fetching user data based on token
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        res.status(401).send({ errors: "No valid token" })
    }
    else {
        try {
            const data = jwt.verify(token, 'ecom_token');
            req.user = data.user;
            next();
        } catch (error) {
            res.status(401).send({ errors: "use valid token" });
        }
    }
}

// API for adding items to cart
// app.post('/addtocart', fetchUser , async (req,res)=>{
//     let userData = await Users.findOne({_id:req.user.id});
//     userData.cartData[req.body.itemId] += 1;
//     await Users.findOneAndUpdate({_id:req.user.id},{cartData:userData.cartData});
//     res.send("Added");
// })

// API for adding items to cart
app.post('/addtocart', fetchUser, async (req, res) => {
    let userData = await Users.findOne({ _id: req.user.id });
    // Get item ID from request body
    const { itemId } = req.body;

    console.log("this was called", itemId);

    // Initialize cartData if it doesn't exist
    if (!userData.cartData) {
        userData.cartData = {};
    }

    // Increment the quantity of the item in the cart
    userData.cartData[itemId] = (userData.cartData[itemId] || 0) + 1;

    // Save updated user
    await userData.save();

    // Send the updated cartData as JSON
    res.json({ success: true, cartData: userData.cartData });
});

// API for removing items from cart
// app.post('/deletefromcart', fetchUser , async (req,res)=>{
//     let userData = await Users.findOne({_id:req.user.id});
//     if(userData.cartData[req.body.itemId]>0)
//     {
//         userData.cartData[req.body.itemId] -= 1;
//     }
//     await Users.findOneAndUpdate({_id:req.user.id},{cartData:userData.cartData});
//     console.log("removed",req.body.itemId);
//     res.send("Removed from cart");
// })

app.post('/removefromcart', fetchUser, async (req, res) => {
    try {
        const { itemId } = req.body;
        const userId = req.user.id;

        // Find the user by ID
        const user = await Users.findById(userId);

        // Check if the item exists in the cart
        if (user.cartData[itemId]) {
            // If the item exists, decrement the quantity
            user.cartData[itemId] -= 1;

            // If the quantity is 0, remove the item from the cart
            if (user.cartData[itemId] <= 0) {
                delete user.cartData[itemId];
            }
        } else {
            // If the item doesn't exist, return an error message
            return res.json({ success: false, message: 'Item not found in cart' });
        }

        // Save the updated user document
        await user.save();

        // Send a success response
        res.json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// API for clearing the entire cart
app.post('/clearcart', fetchUser, async (req, res) => {
    let userData = await Users.findOne({ _id: req.user.id });

    // Clear the cartData object
    userData.cartData = {};

    // Save the updated user data
    await userData.save();

    console.log(userData.cartData)

    // Send a success response
    res.json({ success: true, message: 'Cart cleared successfully' });
});

// API for fetching cart data
app.post('/getdataforcart', fetchUser, async (req, res) => {
    let userData = await Users.findOne({ _id: req.user.id });
    // console.log("Things I am geting", userData.cartData);
    res.json({ cartData: userData.cartData });
});
