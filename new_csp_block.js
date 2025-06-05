app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  let scriptSrc = "'self'"; // Default to 'self'
  let connectSrc = "'self'"; // Default to 'self'

  if (!isProduction) {
    // Allow development server for scripts and connections in non-production
    scriptSrc += " http://127.0.0.1:1337";
    connectSrc += " http://127.0.0.1:1337";
  }

  // Construct the CSP string carefully
  // Note: Backslashes for line continuation must be the very last character on the line.
  const cspValue = `default-src 'self'; \
script-src ${scriptSrc}; \
style-src 'self'; \
font-src 'self'; \
connect-src ${connectSrc}; \
img-src 'self' data:; \
object-src 'none'; \
frame-ancestors 'none'; \
base-uri 'self'; \
form-action 'self'; \
upgrade-insecure-requests; \
block-all-mixed-content;`

  res.setHeader(
    'Content-Security-Policy',
    cspValue
  );
  next();
});
