# LeetCode Company Progress Tracker

Live website : https://leetcode-company-tracker.onrender.com/
Small full‑stack app to visualize your LeetCode progress **company‑wise** using a static dataset plus live data from LeetCode.

## Features

- **Username input**  
  - Enter your LeetCode handle and fetch your latest accepted submissions via LeetCode’s GraphQL API (proxied through a Node server).

- **Company wise problem view**  
  - Uses a prebuilt `data.bin` dataset (company → problems) and matches problems by slug.
  - Shows, per problem, whether you’ve solved it (✔) or not (✘).

- **Filters**
  - **Company filter**: search box to quickly narrow down companies by name.
  - **Company dropdown**: select a single company, or **ALL** to aggregate questions from all companies.
  - **Difficulty dropdown**: filter questions by Easy / Medium / Hard (or All).

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML, CSS, JavaScript

## Getting started (local)

# install dependencies
npm install

# run dev server
npm start
