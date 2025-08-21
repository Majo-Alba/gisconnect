const jwt = require('jsonwebtoken')

// //TOKEN VALIDATION MIDDLEWARE - ADD TO ALL ENDPOINTS WHERE A USER SHOULD BE LOGGED IN TO HAVE ACCESS
function verifyToken(req,res,next) {
    let token = req.headers.authorization.split(" ")[1]

    jwt.verify(token, "kangarookey", (err,data) => {
        if(!err) {
            console.log(data)
            next()
        }
        else {
            res.status(401).send({message: "Invalid Token. Please login again"})
        }
    })
}

module.exports = verifyToken