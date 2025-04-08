from atlassian import Confluence
from urllib.parse import unquote, urlparse, parse_qs
from typing import Tuple
import re

class ConfluencePageFetcher:
    def __init__(self, base_url: str, username: str, password: str):
        """Initialize the Confluence connection with credentials."""
        self.confluence = Confluence(
            url=base_url,
            username=username,
            password=password
        )

    def parse_confluence_url(self, url: str) -> Tuple[str, str]:
        """
        Parse various Confluence URL formats to extract space and title.
        Handles multiple URL patterns including:
        - /display/SPACE/Title
        - /pages/viewpage.action?spaceKey=SPACE&title=Title
        - /spaces/SPACE/pages/Title
        - /wiki/spaces/SPACE/pages/Title
        """
        parsed_url = urlparse(url)
        path_parts = [p for p in parsed_url.path.split('/') if p]
        query_params = parse_qs(parsed_url.query)
        
        # Initialize variables
        space = None
        title = None
        
        # Case 1: viewpage.action format
        if 'viewpage.action' in parsed_url.path:
            space = query_params.get('spaceKey', [None])[0]
            title = query_params.get('title', [None])[0]
            if title:
                title = unquote(title).replace('+', ' ')

        # Case 2: display format
        elif 'display' in path_parts:
            try:
                display_index = path_parts.index('display')
                if len(path_parts) > display_index + 1:
                    space = path_parts[display_index + 1]
                    title = unquote(path_parts[-1])
            except (ValueError, IndexError):
                pass

        # Case 3: spaces format
        elif 'spaces' in path_parts:
            try:
                spaces_index = path_parts.index('spaces')
                if len(path_parts) > spaces_index + 1:
                    space = path_parts[spaces_index + 1]
                    title = unquote(path_parts[-1])
            except (ValueError, IndexError):
                pass

        # Case 4: Simple format (last resort)
        else:
            # Try to get space and title from the last two components
            if len(path_parts) >= 2:
                space = path_parts[-2]
                title = unquote(path_parts[-1])

        # Validate and clean up
        if not space or not title:
            raise ValueError(f"Could not extract space and title from URL: {url}")

        # Clean up the title
        title = self._clean_title(title)
        
        return space, title

    def _clean_title(self, title: str) -> str:
        """Clean up the page title."""
        # Remove file extensions
        title = re.sub(r'\.(html|htm)$', '', title)
        # Replace URL encodings and common separators
        title = title.replace('+', ' ').replace('-', ' ')
        # Remove multiple spaces
        title = ' '.join(title.split())
        return title

    def get_page_content(self, url: str):
        """Fetch page content using the parsed URL information."""
        try:
            space, title = self.parse_confluence_url(url)
            print(f"\nAttempting to retrieve page:")
            print(f"Space: {space}")
            print(f"Title: {title}")

            # Try different title variations
            variations = [
                title,
                title.replace(':', ' -'),
                title.replace(':', ''),
                title.replace(' ', ''),
            ]

            page = None
            used_variation = None

            for title_variant in variations:
                try:
                    page = self.confluence.get_page_by_title(
                        space=space,
                        title=title_variant,
                        expand='body.storage,version'
                    )
                    if page:
                        used_variation = title_variant
                        break
                except Exception as e:
                    print(f"Attempt with '{title_variant}' failed: {str(e)}")

            if not page:
                print("\nPage not found or no access. Details:")
                print("Space:", space)
                print("Attempted title variations:")
                for v in variations:
                    print(f"- {v}")
                return None

            print("\nPage successfully retrieved!")
            print(f"Page ID: {page['id']}")
            print(f"Version: {page['version']['number']}")
            print(f"Successfully used title: {used_variation}")
            return page["body"]["storage"]["value"]

        except Exception as e:
            print(f"Error retrieving page: {str(e)}")
            return None

# Usage
confluence_url = 'https://confluence.nvidia.com/display/DSW/HOW+TO%3A+Generate+Hyp8.1+DDU+image+locally'
fetcher = ConfluencePageFetcher(
    base_url='https://confluence.nvidia.com',
    username='ddarji',
    password='ArPfLkLoQxBbUjHESYdU7rfL8o61Itp07eOoqH'
)

content = fetcher.get_page_content(confluence_url)
if content:
    print("\nContent:")
    print(content)

# space = confluence.get_space("DSW")
# print(space)
