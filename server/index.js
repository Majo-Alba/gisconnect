const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const router = require('./routes/router')
const mongoose = require('mongoose')
require('dotenv/config')

const app = express()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended:false}))

//mj
app.use(express.json());
//mj

app.use('/files', express.static("files"))

// const ordersEvidence = require("./routes/orders.evidence");
app.use("/orders", router);
// new aug17
// app.use("/inventory", require("./routes/inventory"));
// end aug17

const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200
}

app.use(cors(corsOptions))
app.use('/', router)

//const dbOptions = {useNewUrlParser:true, useUnifiedTopology:true}
//mongoose.connect(process.env.DB_URI, dbOptions)
mongoose.connect(process.env.DB_URI)
.then(() => console.log('DB Connected!'))
.catch(err => console.log(err))

const port = process.env.PORT || 4000
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})


