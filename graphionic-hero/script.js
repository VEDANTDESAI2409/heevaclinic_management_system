/**
 * GRAPHIONIC INFOTECH — HERO SECTION JAVASCRIPT
 * Subtle Parallax, Smooth Navigation & Mobile Menu
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const mobileDropdown = document.getElementById('mobile-nav-dropdown');

  if (mobileToggle && mobileDropdown) {
    mobileToggle.addEventListener('click', () => {
      const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', !isExpanded);
      
      if (!isExpanded) {
        mobileDropdown.style.display = 'block';
        mobileDropdown.setAttribute('aria-hidden', 'false');
      } else {
        mobileDropdown.style.display = 'none';
        mobileDropdown.setAttribute('aria-hidden', 'true');
      }
    });

    // Close menu when clicking links
    mobileDropdown.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileDropdown.style.display = 'none';
        mobileDropdown.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // 2. Interactive Subtle Parallax on Desktop
  const stageWrapper = document.getElementById('stage-wrapper');
  const floatingCards = document.querySelectorAll('.floating-card[data-depth]');

  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;
  let isMouseOver = false;

  const handleMouseMove = (e) => {
    const rect = stageWrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Normalized offset between -1 and 1
    mouseX = (e.clientX - centerX) / (window.innerWidth / 2);
    mouseY = (e.clientY - centerY) / (window.innerHeight / 2);
    isMouseOver = true;
  };

  const handleMouseLeave = () => {
    mouseX = 0;
    mouseY = 0;
    isMouseOver = false;
  };

  if (stageWrapper && window.innerWidth > 1024) {
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    const updateParallax = () => {
      // Smooth lerp (linear interpolation)
      currentX += (mouseX - currentX) * 0.08;
      currentY += (mouseY - currentY) * 0.08;

      floatingCards.forEach(card => {
        const depth = parseFloat(card.getAttribute('data-depth')) || 0.05;
        const offsetX = currentX * depth * 70;
        const offsetY = currentY * depth * 70;
        
        // Apply transform while preserving hover scaling
        if (!card.matches(':hover')) {
          card.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        }
      });

      requestAnimationFrame(updateParallax);
    };

    requestAnimationFrame(updateParallax);
  }

  // 3. Smooth CTA scroll behavior
  const secondaryCta = document.getElementById('secondary-hero-cta');
  if (secondaryCta) {
    secondaryCta.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(secondaryCta.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      } else {
        // Subtle feedback if target not yet created
        window.scrollTo({
          top: window.innerHeight * 0.7,
          behavior: 'smooth'
        });
      }
    });
  }

  // 4. Subtle Header shadow on page scroll
  const siteHeader = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      siteHeader.style.backgroundColor = 'rgba(250, 249, 245, 0.9)';
      siteHeader.style.backdropFilter = 'blur(12px)';
      siteHeader.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.03)';
    } else {
      siteHeader.style.backgroundColor = 'transparent';
      siteHeader.style.backdropFilter = 'none';
      siteHeader.style.boxShadow = 'none';
    }
  }, { passive: true });
});
