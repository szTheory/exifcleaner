#!/usr/bin/env perl

# Download the latest version of ExifTool for Unix and Windows
# and verify their checksums.
#
# The Unix version is taken from the source archive, removes
# extra help files to reduce filesize, and squashed down into a single
# Perl file.
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

use constant EXIFTOOL_BASE_URL     => 'https://exiftool.org/';
use constant CHECKSUMS_URL         => EXIFTOOL_BASE_URL . 'checksums.txt';
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
# SHA1(Image-ExifTool-12.01.tar.gz)= 140f014e7686ed80528b919d64c4de0a869e59aa
# SHA1(exiftool-12.01.zip)= a28c3f943165d1eec3ff69bb665390e340686ec6
# SHA1(ExifTool-12.01.dmg)= 327fd67f60fd7f62742d4ddb2f9999da13dc785f
# MD5 (Image-ExifTool-12.01.tar.gz) = 6980a6d435f83c0af060148a354acf24
# MD5 (exiftool-12.01.zip) = e11260548ebff70a3ce27d48e46dfe94
# MD5 (ExifTool-12.01.dmg) = 7a41e56901564f9bd4eb3f907846c118
sub get_checksum_file_text {
  my $command = 'curl ' . CHECKSUMS_URL;

  print_command($command);
  return qx($command);
}

sub get_code_zip_info {
  my $checksum_file_text = shift;

  my ( $filename, $sha1 ) =
    $checksum_file_text =~ /SHA1\((Image-ExifTool-[\w.]+tar[.]gz)\)= (\w+)/m;

  return ( $filename, $sha1 );
}

sub get_windows_exe_info {
  my $checksum_file_text = shift;

  my ( $filename, $sha1 ) =
    $checksum_file_text =~ /SHA1\((exiftool-[\w.]+zip)\)= (\w+)/m;

  return ( $filename, $sha1 );
}

sub download_file {
  my $filename = shift;

  my $url     = EXIFTOOL_BASE_URL . $filename;
  my @command = (
    'wget', '--no-clobber', '--directory-prefix', DOWNLOADS_WORKING_DIR, $url
  );
  run_command(@command);

  return;
}

sub verify_checksum {
  my ( $filename, $sha1 ) = @_;

  my $command = 'shasum ' . DOWNLOADS_WORKING_DIR . "/$filename";
  print_command($command);
  my $output = qx($command);
  my ($calculated_sha1) = split( ' ', $output );

  print $calculated_sha1;
  my $is_match = $sha1 eq $calculated_sha1;

  if ( $sha1 eq $calculated_sha1 ) {
    print_success(" ... Match!\n");
  }
  else {
    die "\n!!! Did NOT match SHA1 from ExifTool website: $sha1 !!!\n";
  }

  return;
}

sub extract_source_code {
  my $gzip_filename = shift;

  my @command = (
    'tar', '--cd', DOWNLOADS_WORKING_DIR, '-xzf',
    DOWNLOADS_WORKING_DIR . "/$gzip_filename"
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

  return;
}

# The Unix version of ExifTool only needs `exiftool` and the `lib` dir.
# In order to keep package size down we only copy these over to the
# ExifCleaner bin dir.
sub move_unix_binary {
  my $code_archive_filename = shift;

  my ($code_dir_name) = $code_archive_filename =~ /^(.+)[.]tar[.]gz$/;
  my $from_dir = DOWNLOADS_WORKING_DIR . "/$code_dir_name";

  # move lib dir
  my @command = ( 'mv', "$from_dir/lib", BIN_DIR_UNIX );
  run_command(@command);

  # move `exiftool` base Perl file
  @command = ( 'mv', "$from_dir/exiftool", BIN_DIR_UNIX );
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

# The Windows ExifTool binary is just an .exe file. We have to
# rename it from `exiftool(-k).exe` to `exiftool.exe` and move
# it to the ExifCleaner Windows bin dir.
sub move_windows_binary {
  my $from_path = DOWNLOADS_WORKING_DIR . '/exiftool(-k).exe';
  my $to_path   = BIN_DIR_WINDOWS . '/exiftool.exe';

  my @command = ( 'mv', $from_path, $to_path );
  run_command(@command);

  return;
}

sub run {
  header('Fetching ExifTool SHA1 checksums from website');
  my $checksum_file_text = get_checksum_file_text();
  my ( $code_filename, $code_sha1 ) = get_code_zip_info($checksum_file_text);
  my ( $windows_filename, $windows_sha1 ) =
    get_windows_exe_info($checksum_file_text);
  print_output("$code_filename - $code_sha1\n");
  print_output("$windows_filename - $windows_sha1\n");

  header('Recreate downloads working directory');
  remove_dir(DOWNLOADS_WORKING_DIR);
  make_dir(DOWNLOADS_WORKING_DIR);

  header('Downloading files');
  download_file($code_filename);
  download_file($windows_filename);

  header('Verifying SHA1 checksums');
  verify_checksum( $code_filename,    $code_sha1 );
  verify_checksum( $windows_filename, $windows_sha1 );

  header('Extracting archives');
  extract_source_code($code_filename);
  extract_windows_exe($windows_filename);

  header('Removing old binaries');
  remove_old_binaries();

  header('Moving fresh binaries');
  move_unix_binary($code_filename);
  move_windows_binary();

  header('Clean up downloads working directory');
  remove_dir(DOWNLOADS_WORKING_DIR);

  return;
}

run();
verify_successful_install();

1;
