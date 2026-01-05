/**
 * GraphQL Sniffer - Injected into page context
 * This intercepts GraphQL requests and relays responses to the content script
 */

(function() {
  'use strict';
  
  // Intercept fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, options = {}] = args;
    
    // Check if this is a GraphQL request
    if (typeof url === 'string' && (url.includes('/graphql/query') || url.includes('/api/graphql'))) {
      // Get body as string
      let bodyStr = '';
      if (typeof options.body === 'string') {
        bodyStr = options.body;
      } else if (options.body instanceof URLSearchParams) {
        bodyStr = options.body.toString();
      } else if (options.body instanceof FormData) {
        for (const [key, value] of options.body.entries()) {
          if (typeof value === 'string') {
            bodyStr += value + ' ';
          }
        }
      } else if (options.body) {
        bodyStr = String(options.body);
      }
      
      // Check if it's a profile page request
      const isProfileRequest = bodyStr.includes('PolarisProfilePageContentQuery') || bodyStr.includes('fetch__XDTUserDict');
      
      // Debug: log all GraphQL fetch requests
      console.log('[Instafn graphql-sniffer] GraphQL fetch request:', url, 'Body preview:', bodyStr.substring(0, 200));
      
      if (isProfileRequest) {
        console.log('[Instafn graphql-sniffer] ✅ Intercepted profile GraphQL request (fetch):', url);
        try {
          const response = await originalFetch.apply(this, args);
          const clonedResponse = response.clone();
          
          try {
            const data = await clonedResponse.json();
            window.postMessage({
              source: 'instafn-graphql',
              type: 'graphql-response',
              url: url,
              data: JSON.stringify(data),
              isProfileRequest: true
            }, '*');
          } catch (parseErr) {
            // Try to get as text
            try {
              const text = await clonedResponse.text();
              window.postMessage({
                source: 'instafn-graphql',
                type: 'graphql-response',
                url: url,
                data: text,
                isProfileRequest: true
              }, '*');
            } catch (e) {
              console.error('[Instafn graphql-sniffer] Error reading response:', e);
            }
          }
          
          return response;
        } catch (err) {
          console.error('[Instafn graphql-sniffer] Error in fetch interceptor:', err);
        }
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._instafnUrl = url;
    this._instafnMethod = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    const url = this._instafnUrl;
    const method = this._instafnMethod;
    
    // Get body as string for checking
    let bodyStr = '';
    if (typeof body === 'string') {
      bodyStr = body;
    } else if (body instanceof URLSearchParams) {
      bodyStr = body.toString();
    } else if (body instanceof FormData) {
      // FormData - get all values
      for (const [key, value] of body.entries()) {
        if (typeof value === 'string') {
          bodyStr += value + ' ';
        }
      }
    } else if (body) {
      bodyStr = String(body);
    }
    
    // Check if this is an inbox GraphQL request
    const isInboxRequest = url && (
      (url.includes('/ajax/bz') && url.includes('PolarisDirectInboxRoute')) ||
      (url.includes('/api/graphql') && (bodyStr.includes('PolarisDirectInboxQuery') || bodyStr.includes('get_slide_mailbox')))
    );
    
    // Check if this is a profile page GraphQL request
    const isProfileRequest = url && (
      (url.includes('/graphql/query') || url.includes('/api/graphql')) &&
      (bodyStr.includes('PolarisProfilePageContentQuery') || bodyStr.includes('fetch__XDTUserDict'))
    );
    
      // Only log profile requests to reduce spam
      if (isProfileRequest) {
        console.log('[Instafn graphql-sniffer] ✅ Intercepted profile GraphQL request:', url);
      }
    
    if (isInboxRequest || isProfileRequest) {
      const originalOnReadyStateChange = this.onreadystatechange;
      
      this.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const responseText = this.responseText;
            if (responseText) {
              // Relay to content script via postMessage
              window.postMessage({
                source: 'instafn-graphql',
                type: 'graphql-response',
                url: url,
                data: responseText,
                isProfileRequest: isProfileRequest
              }, '*');
            }
          } catch (err) {
            // Silently fail
          }
        }
        
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };
      
      // Also handle addEventListener for load/readystatechange
      const originalAddEventListener = this.addEventListener;
      this.addEventListener = function(type, listener, options) {
        if (type === 'load' || type === 'readystatechange') {
          return originalAddEventListener.call(this, type, function(event) {
            if (this.readyState === 4 && this.status === 200) {
              try {
                const responseText = this.responseText;
                if (responseText) {
                  window.postMessage({
                    source: 'instafn-graphql',
                    type: 'graphql-response',
                    url: url,
                    data: responseText,
                    isProfileRequest: isProfileRequest
                  }, '*');
                }
              } catch (err) {
                // Silently fail
              }
            }
            if (listener) listener.call(this, event);
          }, options);
        }
        return originalAddEventListener.apply(this, arguments);
      };
    }
    
    return originalXHRSend.apply(this, arguments);
  };
})();

