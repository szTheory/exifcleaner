#!/usr/bin/env perl

# Download the pinned version of ExifTool for Unix and 32-bit Windows
# and verify both archives against upstream SHA2-256 checksums.
#
# The Unix version is taken from the source archive, removes
# extra help files to reduce filesize, and squashes it down into
# a single Perl file.
#
# The Windows version is a prepacked EXE that is simply extracted
# from the zip archive.
package UpdateExifTool 1.0;

use strict;         #complain when a variable is used before declaration
use warnings;       #output run-time warnings to catch bugs early
use diagnostics;    #verbose warnings, consumes memory so disable in production
use autodie;    #functions throw exception on failure instead of returning false
use utf8;       #enable UTF-8 in source code
use open qw(:std :utf8);    #set default encoding of filehandles to UTF-8

use constant EXIFTOOL_VERSION      => '13.59';
use constant EXIFTOOL_BASE_URL     => 'https://exiftool.org/';
use constant CHECKSUMS_URL         => EXIFTOOL_BASE_URL
  . 'checksums-' . EXIFTOOL_VERSION . '.txt';
use constant DOWNLOAD_BASE_URL =>
  'https://downloads.sourceforge.net/project/exiftool/';
use constant DOWNLOADS_WORKING_DIR => 'exiftool_downloads';
use constant RESOURCES_DIR         => '.resources';
use constant BIN_DIR_UNIX          => RESOURCES_DIR . '/nix/bin';
use constant BIN_DIR_WINDOWS       => RESOURCES_DIR . '/win/bin';
use constant COMMAND_PRINT_SIGNAL  => '------> ';
use constant COMMAND_SIGNAL_COLOR  => 'bright_green';
use constant COMMAND_SUCCESS_COLOR => 'bright_green';
use constant COMMAND_ERROR_COLOR   => 'bright_red';
use constant COMMAND_OUTPUT_COLOR  => 'bold blue';
use constant BANNER_OUTPUT_COLOR   => 'bold cyan';

use File::Path qw(make_path remove_tree);
use Term::ANSIColor;

sub print_output {
  my $output = shift;

  print color(COMMAND_OUTPUT_COLOR);
  print "$output";
  print color('reset');

  return;
}

sub print_success {
  my $text = shift;

  print color(COMMAND_SUCCESS_COLOR);
  print "$text\n";
  print color('reset');

  return;
}

sub print_error {
  my $text = shift;

  print color(COMMAND_ERROR_COLOR);
  print "$text\n";
  print color('reset');

  return;
}

sub header {
  my $text = shift;

  my $banner = q{-} x length($text);

  print "\n";
  print color(BANNER_OUTPUT_COLOR);
  print "$banner\n";
  print "$text\n";
  print "$banner\n";
  print color('reset');

  return;
}

sub print_command_signal {
  print color(COMMAND_SIGNAL_COLOR);
  print COMMAND_PRINT_SIGNAL;
  print color('reset');

  return;
}

sub print_command {
  my @command = @_;

  print_command_signal();
  print_output( join( ' ', @command ) . "\n" );

  return;
}

sub run_command {
  my @command = @_;

  print_command(@command);
  system(@command) == 0 or die "system @command failed: $?";

  return;
}

sub make_dir {
  my $dir_path = shift;

  print_command_signal();
  print color(COMMAND_OUTPUT_COLOR);
  make_path( $dir_path, { verbose => 1 } );
  print color('reset');

  return;
}

sub remove_dir {
  my $dir_path = shift;

  print_command( 'remove_tree(' . $dir_path . ')' );
  remove_tree($dir_path);

  return;
}

# Example checksum file output:
#
# SHA2-256(Image-ExifTool-13.59.tar.gz)= 668ea3...8fd65a
# SHA2-256(exiftool-13.59_32.zip)= fe9a55...f05af
sub get_checksum_file_text {
  my @command = ( 'curl', '--fail', '--silent', '--show-error', CHECKSUMS_URL );

  print_command(@command);
  open my $curl, '-|', @command;
  local $/;
  my $text = <$curl>;
  close $curl;
  defined($text) && length($text)
    or die "Empty checksum response from " . CHECKSUMS_URL . "\n";

  return $text;
}

sub get_sha256_for_filename {
  my ( $checksum_file_text, $filename ) = @_;
  my $quoted_filename = quotemeta($filename);
  my @matches =
    $checksum_file_text =~ /^SHA2-256\($quoted_filename\)= ([a-f0-9]{64})$/mg;

  @matches == 1
    or die "Expected exactly one SHA2-256 checksum for $filename\n";

  return $matches[0];
}

sub get_code_archive_info {
  my $checksum_file_text = shift;
  my $filename = 'Image-ExifTool-' . EXIFTOOL_VERSION . '.tar.gz';

  return ( $filename, get_sha256_for_filename( $checksum_file_text, $filename ) );
}

sub get_windows_archive_info {
  my $checksum_file_text = shift;
  # The 32-bit distribution also runs on 64-bit Windows, so one bundle serves
  # both Windows architectures configured in package.json.
  my $filename = 'exiftool-' . EXIFTOOL_VERSION . '_32.zip';

  return ( $filename, get_sha256_for_filename( $checksum_file_text, $filename ) );
}

sub download_file {
  my $filename = shift;

  my $url = DOWNLOAD_BASE_URL . $filename;
  my @command = (
    'curl', '--fail', '--location', '--show-error', '--retry', '3',
    '--output', DOWNLOADS_WORKING_DIR . "/$filename", $url
  );
  run_command(@command);

  return;
}

sub verify_checksum {
  my ( $filename, $expected_sha256 ) = @_;

  my @command =
    ( 'shasum', '-a', '256', DOWNLOADS_WORKING_DIR . "/$filename" );
  print_command(@command);
  open my $shasum, '-|', @command;
  my $output = <$shasum>;
  close $shasum;
  defined($output)
    or die "No SHA2-256 output for $filename\n";
  my ($calculated_sha256) = $output =~ /^([a-f0-9]{64})\s/;
  defined($calculated_sha256)
    or die "Malformed SHA2-256 output for $filename\n";

  print $calculated_sha256;

  if ( $expected_sha256 eq $calculated_sha256 ) {
    print_success(" ... Match!\n");
  }
  else {
    die "\n!!! Did NOT match upstream SHA2-256: $expected_sha256 !!!\n";
  }

  return;
}

sub extract_source_code {
  my $gzip_filename = shift;

  my @command = (
    'tar', '-xvf', DOWNLOADS_WORKING_DIR . "/$gzip_filename",
    '-C',  DOWNLOADS_WORKING_DIR
  );
  run_command(@command);

  return;
}

sub extract_windows_exe {
  my $zip_filename = shift;

  my @command = (
    'unzip', '-d', DOWNLOADS_WORKING_DIR, '-o',
    DOWNLOADS_WORKING_DIR . "/$zip_filename"
  );
  run_command(@command);

  return;
}

sub remove_old_binaries {

  # remove old Unix lib dir
  remove_dir( BIN_DIR_UNIX . '/lib' );

  # remove old Unix `exiftool` bin
  my $remove_path_bin_unix = BIN_DIR_UNIX . '/exiftool';
  if ( -e $remove_path_bin_unix ) {
    my @command = ( 'rm', $remove_path_bin_unix );
    run_command(@command);
  }
  else {
    print_output("No pre-existing Unix binary to remove\n");
  }

  # remove old Windows `exiftool.exe`
  my $remove_path_bin_win = BIN_DIR_WINDOWS . '/exiftool.exe';
  if ( -e $remove_path_bin_win ) {
    my @command = ( 'rm', $remove_path_bin_win );
    run_command(@command);
  }
  else {
    print_output("No pre-existing Windows binary to remove\n");
  }

  # remove old Windows `exiftool_files` dir (new distribution format)
  my $remove_path_files_win = BIN_DIR_WINDOWS . '/exiftool_files';
  if ( -d $remove_path_files_win ) {
    remove_dir($remove_path_files_win);
  }

  return;
}

# The Unix version of ExifTool only needs `exiftool` and the `lib` dir.
# In order to keep package size down we only copy these over to the
# ExifCleaner bin dir.
sub copy_unix_binary {
  my $code_archive_filename = shift;

  my ($code_dir_name) = $code_archive_filename =~ /^(.+)[.]tar[.]gz$/;
  my $from_dir = DOWNLOADS_WORKING_DIR . "/$code_dir_name";

  # move lib dir
  my @command = ( 'cp', '-R', "$from_dir/lib", BIN_DIR_UNIX );
  run_command(@command);

  # move `exiftool` base Perl file
  @command = ( 'cp', "$from_dir/exiftool", BIN_DIR_UNIX );
  run_command(@command);

  return;
}

sub verify_successful_install {
  my $command = BIN_DIR_UNIX . '/exiftool -ver';
  my $version = qx($command);
  if ($version) {
    print "\n";
    print_success("Success! Updated to ExifTool $version\n");
  }
  else {
    print_error(
      "Error while attempting to verify ExifTool install with $command\n");
  }

  return;
}

# The Windows ExifTool distribution contains `exiftool(-k).exe` plus a
# companion `exiftool_files/` directory. Both are inside a versioned
# subdirectory within the zip. We copy the exe (renamed to `exiftool.exe`)
# and the companion directory to the ExifCleaner Windows bin dir.
sub copy_windows_binary {
  my $zip_filename = shift;

  my ($zip_dir_name) = $zip_filename =~ /^(.+)[.]zip$/;
  my $from_dir = DOWNLOADS_WORKING_DIR . "/$zip_dir_name";

  # copy exiftool(-k).exe as exiftool.exe
  my $from_exe = "$from_dir/exiftool(-k).exe";
  my $to_exe   = BIN_DIR_WINDOWS . '/exiftool.exe';
  my @command = ( 'cp', $from_exe, $to_exe );
  run_command(@command);

  # copy companion exiftool_files/ directory if it exists (new format)
  my $from_files_dir = "$from_dir/exiftool_files";
  if ( -d $from_files_dir ) {
    @command = ( 'cp', '-R', $from_files_dir, BIN_DIR_WINDOWS );
    run_command(@command);
  }

  return;
}

sub is_exiftool_already_downloaded {
  my ( $code_filename, $windows_version_filename ) = @_;

  my $code_path    = DOWNLOADS_WORKING_DIR . "/$code_filename";
  my $windows_path = DOWNLOADS_WORKING_DIR . "/$windows_version_filename";

  my $download_folder_exists     = -d DOWNLOADS_WORKING_DIR;
  my $code_downloaded            = -e $code_path;
  my $windows_version_downloaded = -e $windows_path;

  return
       $download_folder_exists
    && $code_downloaded
    && $windows_version_downloaded;
}

sub run {
  my $cache_downloads_working_dir = shift;

  header('Fetching ExifTool SHA2-256 checksums from website');
  my $checksum_file_text = get_checksum_file_text();
  my ( $code_filename, $code_sha256 ) =
    get_code_archive_info($checksum_file_text);
  my ( $windows_version_filename, $windows_sha256 ) =
    get_windows_archive_info($checksum_file_text);
  my $exiftool_already_downloaded =
    is_exiftool_already_downloaded( $code_filename, $windows_version_filename );
  print_output("$code_filename - $code_sha256\n");
  print_output("$windows_version_filename - $windows_sha256\n");

  header('Recreate downloads working directory');
  if ( $cache_downloads_working_dir && $exiftool_already_downloaded ) {
    print_command(
"Keeping existing downloads working directory since download caching is enabled"
    );
  }
  else {
    remove_dir(DOWNLOADS_WORKING_DIR);
    make_dir(DOWNLOADS_WORKING_DIR);
  }

  header('Downloading files');

  if ( $cache_downloads_working_dir && $exiftool_already_downloaded ) {
    print_command( "Skipping download since the downloads working directory '"
        . DOWNLOADS_WORKING_DIR
        . "' already exists and download caching is enabled" );
  }
  else {
    download_file($code_filename);
    download_file($windows_version_filename);
  }

  header('Verifying SHA2-256 checksums');
  verify_checksum( $code_filename,            $code_sha256 );
  verify_checksum( $windows_version_filename, $windows_sha256 );

  header('Extracting archives');
  extract_source_code($code_filename);
  extract_windows_exe($windows_version_filename);

  header('Removing old binaries');
  remove_old_binaries();

  header('Moving fresh binaries');
  copy_unix_binary($code_filename);
  copy_windows_binary($windows_version_filename);

  header('Clean up downloads working directory');
  if ($cache_downloads_working_dir) {
    print_command(
      "Keeping downloads working directory since caching is enabled.");
  }
  else {
    remove_dir(DOWNLOADS_WORKING_DIR);
  }

  return;
}

# Pass the command line argument --cache-downloads-working-dir
# to cache the downloads working directory to avoid repeated
# downloads from the exiftool server. Useful for CI
unless (caller) {
  my $cache_downloads_working_dir =
    defined($ARGV[0]) && $ARGV[0] eq "--cache-downloads-working-dir";

  run($cache_downloads_working_dir);
  verify_successful_install();
}

1;
