# Patente explanation recorder

This page is served from `/patente-recorder/` and reads the existing files:

- `../assets/PatenteChapters.json`
- `../assets/PatenteQuestions.json`

## Firebase setup

1. Register a Web app in Firebase Project settings.
2. Enable Email/Password in Firebase Authentication.
3. Create the recorder account in Authentication > Users. The authorized UID is
   listed in `firebase-config.js`.
4. Add the Firebase Web configuration to `firebase-config.js`.
5. Publish `storage.rules.example` in Firebase Storage > Rules.
6. Add the GitHub Pages domain and custom domain to Authentication > Settings >
   Authorized domains.

Recordings are uploaded as `question-explanations/{questionId}`. Uploading a new
explanation for the same question replaces the existing object.

Serve the repository through HTTP for local testing; opening `index.html` directly
will not allow the JSON `fetch()` calls. For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/patente-recorder/`.
